import { z } from 'zod';

import { HttpError, InvalidResponseError, NetworkError, UnauthenticatedError } from '../api/errors';
import { sessionErrorCode, sessionSubmissionBodySchema, type FocusSession } from '../api/sessions';
import {
  readStoredJson,
  type KeyValueStorage,
  type ParsedValue,
  type StorageIssue,
} from '../common/stored-json';
import type { SessionSubmission, SessionSubmissionBody } from '../timer/submission';

/** One key per user: a user never sees or sends another's sessions, and sign-out keeps them. */
export const sessionOutboxKey = (userId: string) => `focus-forest/session-outbox/v1/${userId}`;

/**
 * `pending`: waiting to be sent, or sent without a known answer (offline, 5xx, 401,
 * `ends_in_future`). `blocked_topic`: its topic is not on the server yet (a create still queued,
 * or a 404); sent once the topic is synced. `blocked_timezone`: the profile has no time zone
 * (`timezone_required`); retried on every flush, for when it is set. `needs_attention`: an answer
 * the app cannot resolve by itself; kept, never retried automatically, never dropped.
 */
export type QueuedSessionState =
  'pending' | 'blocked_topic' | 'blocked_timezone' | 'needs_attention';

/**
 * Why a session needs attention: another saved session covers its time, its id was used for
 * another submission, the server refused its times (an evaluator 422, a 400), or the server
 * answered something that breaks the contract (it may have stored it).
 */
export type AttentionReason =
  'session_overlap' | 'session_id_conflict' | 'rejected' | 'invalid_response';

export interface QueuedSession {
  /** The client-generated session id: the path id of every attempt. */
  id: string;
  /** Exactly what `toSubmission` built when the timer was handed off; never changed. */
  payload: SessionSubmissionBody;
  state: QueuedSessionState;
  /** Set exactly when the state is `needs_attention`. */
  reason: AttentionReason | null;
  /** When it was handed off (epoch ms): the order sessions are sent in. */
  queuedAt: number;
}

export interface SessionOutboxSnapshot {
  status: 'inactive' | 'restoring' | 'ready' | 'unavailable';
  userId: string | null;
  items: QueuedSession[];
  /**
   * Sessions synced by this process, as the server answered them (for the completion screen).
   * Memory only: the completion receipt is what outlives the process.
   */
  synced: Record<string, FocusSession>;
}

export type OutboxEnqueueResult =
  | { ok: true; replayed: boolean }
  | { ok: false; reason: 'not_ready' | 'invalid_submission' | 'id_conflict' | 'storage_failed' };

export interface SessionOutboxOptions {
  storage: KeyValueStorage;
  now: () => number;
  report: (issue: StorageIssue) => void;
  /** Sends one session (PUT /me/sessions/:id) and returns the validated answer. */
  send: (id: string, payload: SessionSubmissionBody) => Promise<FocusSession>;
  /** Whether the server has this topic: no create for it is queued. False when unknown. */
  isTopicSynced: (topicId: string) => boolean;
  /** Tries to send the queued topic creates (the topic queue's flush). */
  syncTopics: () => Promise<void>;
  /**
   * Called once the server has confirmed a session (a validated 201 or 200), after its removal
   * was attempted: a side effect such as refreshing what the server derives from sessions. The
   * removal never waits on it, and a failure in it changes nothing here.
   */
  onSynced?: (userId: string, session: FocusSession) => void;
  /**
   * Stores the validated answer durably (the completion receipt), before the session may leave
   * the outbox; resolves false when it could not be. Until it is stored, the session stays
   * queued and is replayed (200) on a later flush, so its answer is never known only in memory.
   */
  keepReceipt?: (userId: string, session: FocusSession) => Promise<boolean>;
  /**
   * Gives the user's profile a time zone (PATCH /me/profile with the device's zone) after a
   * `timezone_required` answer; resolves true once the server accepted it. Tried at most once per
   * flush, whatever the number of blocked sessions; then the same raw session is sent again.
   * False (no valid device zone, or the PATCH failed) leaves the sessions `blocked_timezone`.
   */
  repairTimeZone?: (userId: string) => Promise<boolean>;
}

const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const itemSchema = z
  .strictObject({
    id: z.string().regex(LOWERCASE_UUID),
    payload: sessionSubmissionBodySchema,
    state: z.enum(['pending', 'blocked_topic', 'blocked_timezone', 'needs_attention']),
    reason: z
      .enum(['session_overlap', 'session_id_conflict', 'rejected', 'invalid_response'])
      .nullable(),
    queuedAt: z.number().int().nonnegative(),
  })
  .refine((item) => (item.state === 'needs_attention') === (item.reason !== null));

const documentSchema = z.strictObject({
  version: z.literal(1),
  items: z
    .array(itemSchema)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
});

function parseDocument(value: unknown): ParsedValue<QueuedSession[]> {
  const version = (value as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version !== 1) {
    return { ok: false, reason: 'unsupported_version' };
  }
  const parsed = documentSchema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data.items }
    : { ok: false, reason: 'invalid_state' };
}

type Outcome =
  | { kind: 'synced'; session: FocusSession }
  /**
   * Unknown whether it was stored, or refused for now: keep it. `stop`: out of reach.
   * `pending`: the answer says it is sendable (`ends_in_future`); otherwise nothing new is known.
   */
  | { kind: 'retry'; stop: boolean; pending?: true }
  | { kind: 'blocked'; state: 'blocked_topic' | 'blocked_timezone' }
  | { kind: 'attention'; reason: AttentionReason };

function classify(error: unknown): Outcome {
  if (error instanceof NetworkError || error instanceof UnauthenticatedError) {
    return { kind: 'retry', stop: true };
  }
  if (error instanceof InvalidResponseError)
    return { kind: 'attention', reason: 'invalid_response' };
  if (!(error instanceof HttpError)) return { kind: 'retry', stop: true };
  if (error.status >= 500) return { kind: 'retry', stop: false };
  // The only 404 of this route: the topic is not on the server.
  if (error.status === 404) return { kind: 'blocked', state: 'blocked_topic' };
  const code = sessionErrorCode(error);
  // The device clock is ahead of the server's: the same payload is accepted later.
  if (code === 'ends_in_future') return { kind: 'retry', stop: false, pending: true };
  if (code === 'timezone_required') return { kind: 'blocked', state: 'blocked_timezone' };
  if (code === 'session_overlap' || code === 'session_id_conflict') {
    return { kind: 'attention', reason: code };
  }
  return { kind: 'attention', reason: 'rejected' };
}

const INACTIVE: SessionOutboxSnapshot = { status: 'inactive', userId: null, items: [], synced: {} };

/**
 * The signed-in user's finished sessions waiting for the server (docs/07 §4: queued on the
 * device, retried automatically, idempotent by the client id). Every change is stored before it
 * shows. A session's payload is stored once, at the handoff, and sent unchanged on every
 * attempt; it leaves the outbox only after a validated answer, and only when that removal is
 * stored. Flushes run one at a time, oldest first, and a blocked session never holds back the
 * others.
 */
export class SessionOutbox {
  private snapshot: SessionOutboxSnapshot = INACTIVE;
  private listeners = new Set<() => void>();
  // Bumped on every activate and deactivate, so work for a previous user never lands.
  private generation = 0;
  private writes: Promise<unknown> = Promise.resolve();
  private flushing: { generation: number; run: Promise<void> } | null = null;

  constructor(private readonly options: SessionOutboxOptions) {}

  getSnapshot = (): SessionOutboxSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Reads the user's outbox. Does not flush: the caller flushes once the app can send. */
  async activate(userId: string): Promise<SessionOutboxSnapshot> {
    const generation = ++this.generation;
    this.set({ status: 'restoring', userId, items: [], synced: {} });
    const { storage, report } = this.options;
    // Unsynced sessions exist nowhere else: an entry is removed only once a copy is kept.
    const read = await readStoredJson(storage, sessionOutboxKey(userId), parseDocument, report, {
      removeOnlyIfKept: true,
    });
    if (generation !== this.generation) return this.snapshot;
    this.set({
      status: read.kind === 'unavailable' ? 'unavailable' : 'ready',
      userId,
      items: read.kind === 'ok' ? read.value : [],
      synced: {},
    });
    return this.snapshot;
  }

  /** Forgets the outbox in memory (sign-out). Storage keeps it for the user's next sign-in. */
  deactivate(): void {
    this.generation += 1;
    this.set(INACTIVE);
  }

  /**
   * Stores a finished session for `userId` (who must be the active user). The same id with the
   * same payload is a replay: nothing changes. The same id with another payload is refused and
   * the stored one kept.
   */
  enqueue(userId: string, submission: SessionSubmission): Promise<OutboxEnqueueResult> {
    let result: OutboxEnqueueResult = { ok: false, reason: 'not_ready' };
    if (this.snapshot.userId !== userId) return Promise.resolve(result);
    // Only what a restore would accept is stored, so a stored session is never quarantined.
    if (
      !LOWERCASE_UUID.test(submission.id) ||
      !sessionSubmissionBodySchema.safeParse(submission.body).success
    ) {
      return Promise.resolve({ ok: false, reason: 'invalid_submission' });
    }
    const item: QueuedSession = {
      id: submission.id,
      payload: submission.body,
      state: 'pending',
      reason: null,
      queuedAt: this.options.now(),
    };
    return this.commit(this.generation, (items) => {
      const existing = items.find((candidate) => candidate.id === item.id);
      if (existing) {
        result = samePayload(existing.payload, item.payload)
          ? { ok: true, replayed: true }
          : { ok: false, reason: 'id_conflict' };
        return null;
      }
      return [...items, item];
    }).then((stored) => {
      if (stored) return { ok: true, replayed: false };
      if (result.ok || result.reason === 'id_conflict') return result;
      return { ok: false, reason: this.readyFor(userId) ? 'storage_failed' : 'not_ready' };
    });
  }

  /** Sends every session that can be sent, oldest first. Overlapping calls share one run. */
  flush(): Promise<void> {
    const generation = this.generation;
    if (this.flushing?.generation === generation) return this.flushing.run;
    const run = this.runFlush(generation).finally(() => {
      if (this.flushing?.run === run) this.flushing = null;
    });
    this.flushing = { generation, run };
    return run;
  }

  private async runFlush(generation: number): Promise<void> {
    const tried = new Set<string>();
    let askedForTopics = false;
    let repairedTimeZone = false;
    for (;;) {
      if (generation !== this.generation || !this.ready()) return;
      const userId = this.snapshot.userId as string;
      const next = this.snapshot.items.find(
        (item) => item.state !== 'needs_attention' && !tried.has(item.id),
      );
      if (!next) return;
      tried.add(next.id);

      const { isTopicSynced, syncTopics, send } = this.options;
      if (!isTopicSynced(next.payload.topicId) && !askedForTopics) {
        askedForTopics = true;
        await syncTopics().catch(() => undefined);
        if (generation !== this.generation) return;
      }
      if (!isTopicSynced(next.payload.topicId)) {
        await this.setState(generation, next.id, 'blocked_topic', null);
        continue;
      }

      let outcome: Outcome;
      try {
        const session = await send(next.id, next.payload);
        outcome =
          session.id === next.id
            ? { kind: 'synced', session }
            : { kind: 'attention', reason: 'invalid_response' };
      } catch (error) {
        outcome = classify(error);
      }
      if (generation !== this.generation) return;

      if (
        outcome.kind === 'blocked' &&
        outcome.state === 'blocked_timezone' &&
        !repairedTimeZone &&
        this.options.repairTimeZone
      ) {
        // One repair per flush; on success the same session is sent again, unchanged.
        repairedTimeZone = true;
        const repaired = await this.options.repairTimeZone(userId).catch(() => false);
        if (generation !== this.generation) return;
        if (repaired) {
          tried.delete(next.id);
          continue;
        }
      }

      if (outcome.kind === 'synced') {
        const { session } = outcome;
        const kept = (await this.options.keepReceipt?.(userId, session).catch(() => false)) ?? true;
        if (generation !== this.generation) return;
        // Not kept: it stays queued, and the next flush replays it (200) and tries again.
        const removed =
          kept &&
          (await this.commit(generation, (items) => items.filter((item) => item.id !== next.id)));
        // Not stored: it stays queued, and the next flush replays it (200).
        if (removed && generation === this.generation) {
          this.set({ ...this.snapshot, synced: { ...this.snapshot.synced, [next.id]: session } });
        }
        if (generation === this.generation) {
          try {
            this.options.onSynced?.(userId, session);
          } catch {
            // A refresh that fails leaves the synced session synced.
          }
        }
      } else if (outcome.kind === 'blocked') {
        await this.setState(generation, next.id, outcome.state, null);
      } else if (outcome.kind === 'attention') {
        await this.setState(generation, next.id, 'needs_attention', outcome.reason);
      } else {
        if (outcome.pending) await this.setState(generation, next.id, 'pending', null);
        if (outcome.stop) return;
      }
    }
  }

  /** Stores a new state for a session; the payload is never touched. */
  private setState(
    generation: number,
    id: string,
    state: QueuedSessionState,
    reason: AttentionReason | null,
  ): Promise<boolean> {
    return this.commit(generation, (items) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item || (item.state === state && item.reason === reason)) return null;
      return items.map((candidate) =>
        candidate.id === id ? { ...candidate, state, reason } : candidate,
      );
    });
  }

  /**
   * Applies a change to the stored outbox, one at a time: the new list is written first and
   * shown only once stored. `change` returns null to change nothing. Resolves false when
   * nothing was stored.
   */
  private commit(
    generation: number,
    change: (items: QueuedSession[]) => QueuedSession[] | null,
  ): Promise<boolean> {
    const write = this.writes.then(async () => {
      if (generation !== this.generation || !this.ready()) return false;
      const { userId, items, synced } = this.snapshot;
      const next = change(items);
      if (!next || !userId) return false;
      try {
        await this.options.storage.setItem(
          sessionOutboxKey(userId),
          JSON.stringify({ version: 1, items: next }),
        );
      } catch {
        this.options.report({ code: 'write_failed' });
        return false;
      }
      if (generation !== this.generation) return false;
      this.set({ status: 'ready', userId, items: next, synced });
      return true;
    });
    this.writes = write.catch(() => undefined);
    return write;
  }

  private ready(): boolean {
    return this.snapshot.status === 'ready' && this.snapshot.userId !== null;
  }

  private readyFor(userId: string): boolean {
    return this.ready() && this.snapshot.userId === userId;
  }

  private set(snapshot: SessionOutboxSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

/** Equal in value: the same fields, times, and pauses (key order does not matter). */
function samePayload(a: SessionSubmissionBody, b: SessionSubmissionBody): boolean {
  return (
    a.topicId === b.topicId &&
    a.startedAt === b.startedAt &&
    a.endedAt === b.endedAt &&
    a.plannedMinutes === b.plannedMinutes &&
    a.pauseIntervals.length === b.pauseIntervals.length &&
    a.pauseIntervals.every(
      (pause, i) =>
        pause.startedAt === b.pauseIntervals[i]?.startedAt &&
        pause.endedAt === b.pauseIntervals[i]?.endedAt,
    )
  );
}
