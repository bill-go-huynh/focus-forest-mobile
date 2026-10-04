import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import { growthResultSchema, type GrowthResult } from '../api/core-loop';
import type { FocusSession } from '../api/sessions';
import {
  readStoredJson,
  type KeyValueStorage,
  type ParsedValue,
  type StorageIssue,
} from '../common/stored-json';

/** One key per user: a user never sees another's celebrations, and sign-out keeps them. */
export const celebrationsKey = (userId: string) => `focus-forest/celebrations/v1/${userId}`;

/** Technical bound on remembered consumed sessions (replay protection), not Product configuration. */
export const CONSUMED_MAX = 100;

/** Technical bound on remembered days whose reached goal was celebrated, not Product configuration. */
export const GOALS_CELEBRATED_MAX = 60;

/**
 * A server-confirmed growth that still has to be shown: the session's id and start (its order),
 * and the GrowthResult exactly as the server answered it. Nothing is derived from it here.
 */
export interface CelebrationIntent {
  sessionId: string;
  startedAt: string;
  growth: GrowthResult;
}

export interface CelebrationsSnapshot {
  status: 'inactive' | 'restoring' | 'ready' | 'unavailable';
  userId: string | null;
  /** In session order (start, then id). */
  pending: CelebrationIntent[];
  /** Sessions a screen is showing now (Completion): others leave them alone. Memory only. */
  held: string[];
  /** Days (the server's local dates) whose reached daily goal was already celebrated. */
  goalsCelebrated: string[];
}

export interface CelebrationStoreOptions {
  storage: KeyValueStorage;
  report: (issue: StorageIssue) => void;
}

const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sessionId = z.string().regex(LOWERCASE_UUID);

const documentSchema = z.strictObject({
  version: z.literal(1),
  pending: z
    .array(
      z.strictObject({
        sessionId,
        startedAt: z.iso.datetime(),
        growth: growthResultSchema.refine(isCelebratable),
      }),
    )
    .refine((items) => new Set(items.map((item) => item.sessionId)).size === items.length),
  consumed: z.array(sessionId).max(CONSUMED_MAX),
  // Optional: documents saved before M3.3 have none and still read as version 1.
  goalsCelebrated: z.array(z.iso.date()).max(GOALS_CELEBRATED_MAX).optional(),
});

interface Stored {
  pending: CelebrationIntent[];
  consumed: string[];
  goalsCelebrated: string[];
}

function parseDocument(value: unknown): ParsedValue<Stored> {
  const version = (value as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version !== 1) {
    return { ok: false, reason: 'unsupported_version' };
  }
  const parsed = documentSchema.safeParse(value);
  return parsed.success
    ? {
        ok: true,
        value: {
          pending: parsed.data.pending,
          consumed: parsed.data.consumed,
          goalsCelebrated: parsed.data.goalsCelebrated ?? [],
        },
      }
    : { ok: false, reason: 'invalid_state' };
}

/**
 * Whether a session's growth is a tree moment to show: counted, in a month still open, with the
 * tree after it. Growth null (a session stored before Phase 3), a session that does not count,
 * and a late session of an archived month (`monthClosed`) are saved sessions with nothing to
 * celebrate.
 */
export function isCelebratable(growth: GrowthResult | null | undefined): growth is GrowthResult {
  return !!growth && growth.counted && !growth.monthClosed && growth.tree !== null;
}

const bySessionOrder = (a: CelebrationIntent, b: CelebrationIntent) =>
  Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.sessionId.localeCompare(b.sessionId);

const INACTIVE: CelebrationsSnapshot = {
  status: 'inactive',
  userId: null,
  pending: [],
  held: [],
  goalsCelebrated: [],
};

/**
 * Server-confirmed tree growth waiting to be shown, per user, durable across kills (M3.2). A
 * synced session records its growth here before it may leave the outbox, so a growth answered
 * after the user left Completion is never lost. Each session is recorded once (a replayed answer
 * changes nothing) and consumed once: a consumed session is remembered, so it never comes back.
 * Every change is stored before it shows. A corrupt entry is moved aside and the store starts empty.
 *
 * It also remembers the days whose reached daily goal was celebrated (M3.3), so meeting a goal
 * is said once, on whichever screen first shows the server saying so.
 */
export class CelebrationStore {
  private snapshot: CelebrationsSnapshot = INACTIVE;
  private consumed: string[] = [];
  private listeners = new Set<() => void>();
  private generation = 0;
  // Reads and writes, one at a time: a record made during the read waits for it.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: CelebrationStoreOptions) {}

  getSnapshot = (): CelebrationsSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  activate(userId: string): Promise<CelebrationsSnapshot> {
    const generation = ++this.generation;
    this.consumed = [];
    this.set({ status: 'restoring', userId, pending: [], held: [], goalsCelebrated: [] });
    const read = this.queue.then(async () => {
      if (generation !== this.generation) return this.snapshot;
      const { storage, report } = this.options;
      const stored = await readStoredJson(storage, celebrationsKey(userId), parseDocument, report, {
        removeOnlyIfKept: true,
      });
      if (generation !== this.generation) return this.snapshot;
      this.consumed = stored.kind === 'ok' ? stored.value.consumed : [];
      this.set({
        status: stored.kind === 'unavailable' ? 'unavailable' : 'ready',
        userId,
        pending: stored.kind === 'ok' ? [...stored.value.pending].sort(bySessionOrder) : [],
        held: [],
        goalsCelebrated: stored.kind === 'ok' ? stored.value.goalsCelebrated : [],
      });
      return this.snapshot;
    });
    this.queue = read.catch(() => undefined);
    return read;
  }

  /** Forgets everything in memory (sign-out). Storage keeps it for the user's next sign-in. */
  deactivate(): void {
    this.generation += 1;
    this.consumed = [];
    this.set(INACTIVE);
  }

  /**
   * Records the server's answer for `userId` (the active user). Resolves true when there is
   * nothing more to keep: stored now, already pending or consumed, or nothing to celebrate.
   * False when it could not be stored, so the caller keeps the session queued and replays it.
   */
  record(userId: string, session: FocusSession): Promise<boolean> {
    const growth = session.growth;
    if (!isCelebratable(growth)) return Promise.resolve(true);
    return this.commit(userId, (current) => {
      const { pending, consumed } = current;
      if (consumed.includes(session.id) || pending.some((p) => p.sessionId === session.id)) {
        return 'unchanged';
      }
      const intent = { sessionId: session.id, startedAt: session.startedAt, growth };
      return { ...current, pending: [...pending, intent].sort(bySessionOrder) };
    });
  }

  /** Marks sessions shown: removed from pending and remembered, stored first. */
  consume(userId: string, sessionIds: readonly string[]): Promise<boolean> {
    return this.commit(userId, (current) => {
      const { pending, consumed } = current;
      const ids = sessionIds.filter((id) => pending.some((p) => p.sessionId === id));
      if (ids.length === 0) return 'unchanged';
      return {
        ...current,
        pending: pending.filter((p) => !ids.includes(p.sessionId)),
        consumed: [...consumed.filter((id) => !ids.includes(id)), ...ids].slice(-CONSUMED_MAX),
      };
    });
  }

  /**
   * Marks the reached daily goal of `date` (the server's local date) celebrated, stored before
   * it shows. Resolves true when it is marked (now or before), false when it could not be stored.
   */
  celebrateGoal(userId: string, date: string): Promise<boolean> {
    return this.commit(userId, (current) =>
      current.goalsCelebrated.includes(date)
        ? 'unchanged'
        : {
            ...current,
            goalsCelebrated: [...current.goalsCelebrated, date].slice(-GOALS_CELEBRATED_MAX),
          },
    );
  }

  /** A screen is showing this session's celebration: nothing else presents it meanwhile. */
  hold(sessionId: string): void {
    if (this.snapshot.held.includes(sessionId)) return;
    this.set({ ...this.snapshot, held: [...this.snapshot.held, sessionId] });
  }

  release(sessionId: string): void {
    if (!this.snapshot.held.includes(sessionId)) return;
    this.set({ ...this.snapshot, held: this.snapshot.held.filter((id) => id !== sessionId) });
  }

  private commit(
    userId: string,
    change: (current: Stored) => Stored | 'unchanged',
  ): Promise<boolean> {
    const generation = this.generation;
    const write = this.queue.then(async () => {
      const { status, userId: owner, pending, held, goalsCelebrated } = this.snapshot;
      if (generation !== this.generation || status !== 'ready' || owner !== userId) return false;
      const next = change({ pending, consumed: this.consumed, goalsCelebrated });
      if (next === 'unchanged') return true;
      try {
        await this.options.storage.setItem(
          celebrationsKey(userId),
          JSON.stringify({
            version: 1,
            pending: next.pending,
            consumed: next.consumed,
            goalsCelebrated: next.goalsCelebrated,
          }),
        );
      } catch {
        this.options.report({ code: 'write_failed' });
        return false;
      }
      if (generation !== this.generation) return false;
      this.consumed = next.consumed;
      this.set({
        status: 'ready',
        userId,
        pending: next.pending,
        held,
        goalsCelebrated: next.goalsCelebrated,
      });
      return true;
    });
    this.queue = write.catch(() => undefined);
    return write;
  }

  private set(snapshot: CelebrationsSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

/** The app's celebration store, on AsyncStorage. Issues are reported by code only. */
export function createAppCelebrationStore(): CelebrationStore {
  return new CelebrationStore({
    storage: AsyncStorage,
    report: (issue) => console.warn(`[celebrations] celebration store: ${issue.code}`),
  });
}
