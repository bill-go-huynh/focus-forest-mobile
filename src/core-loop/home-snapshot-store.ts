import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import { homeSchema, type HomeResponse } from '../api/core-loop';
import {
  readStoredJson,
  type KeyValueStorage,
  type ParsedValue,
  type StorageIssue,
} from '../common/stored-json';

/** One key per user: a user never sees another's Home, and sign-out keeps it. */
export const homeSnapshotKey = (userId: string) => `focus-forest/home/v1/${userId}`;

export interface HomeSnapshot {
  status: 'inactive' | 'restoring' | 'ready' | 'unavailable';
  userId: string | null;
  /** When the request behind the saved Home began (epoch ms); null when nothing is saved. */
  savedAt: number | null;
  /** The last Home the server answered, exactly; null when nothing is saved. */
  home: HomeResponse | null;
}

export interface HomeSnapshotStoreOptions {
  storage: KeyValueStorage;
  report: (issue: StorageIssue) => void;
}

const documentSchema = z.strictObject({
  version: z.literal(1),
  savedAt: z.number().int().nonnegative(),
  home: homeSchema,
});

function parseDocument(value: unknown): ParsedValue<{ savedAt: number; home: HomeResponse }> {
  const version = (value as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version !== 1) {
    return { ok: false, reason: 'unsupported_version' };
  }
  const parsed = documentSchema.safeParse(value);
  return parsed.success
    ? { ok: true, value: { savedAt: parsed.data.savedAt, home: parsed.data.home } }
    : { ok: false, reason: 'invalid_state' };
}

const INACTIVE: HomeSnapshot = { status: 'inactive', userId: null, savedAt: null, home: null };

/**
 * The user's last Home answer (tree, goals, streak, week, recent topics), saved so Home stays
 * meaningful offline and at an offline launch. A read cache of exactly what the server said: the
 * live answer always wins, an older answer never replaces a newer one, nothing is computed or
 * merged into it, and the renderer's composition is never saved. A corrupt entry is moved aside.
 */
export class HomeSnapshotStore {
  private snapshot: HomeSnapshot = INACTIVE;
  private listeners = new Set<() => void>();
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: HomeSnapshotStoreOptions) {}

  getSnapshot = (): HomeSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  activate(userId: string): Promise<HomeSnapshot> {
    const generation = ++this.generation;
    this.set({ status: 'restoring', userId, savedAt: null, home: null });
    const read = this.queue.then(async () => {
      if (generation !== this.generation) return this.snapshot;
      const { storage, report } = this.options;
      const stored = await readStoredJson(storage, homeSnapshotKey(userId), parseDocument, report);
      if (generation !== this.generation) return this.snapshot;
      this.set({
        status: stored.kind === 'unavailable' ? 'unavailable' : 'ready',
        userId,
        savedAt: stored.kind === 'ok' ? stored.value.savedAt : null,
        home: stored.kind === 'ok' ? stored.value.home : null,
      });
      return this.snapshot;
    });
    this.queue = read.catch(() => undefined);
    return read;
  }

  /** Forgets it in memory (sign-out). Storage keeps it. */
  deactivate(): void {
    this.generation += 1;
    this.set(INACTIVE);
  }

  /**
   * Saves Home as answered for `userId` (the active user) by a request that began at `savedAt`.
   * True once stored; false for another user, an older answer, or a failed write.
   */
  save(userId: string, home: HomeResponse, savedAt: number): Promise<boolean> {
    const generation = this.generation;
    const write = this.queue.then(async () => {
      const { status, userId: owner, savedAt: current } = this.snapshot;
      if (generation !== this.generation || status !== 'ready' || owner !== userId) return false;
      if (current !== null && savedAt < current) return false;
      try {
        await this.options.storage.setItem(
          homeSnapshotKey(userId),
          JSON.stringify({ version: 1, savedAt, home }),
        );
      } catch {
        this.options.report({ code: 'write_failed' });
        return false;
      }
      if (generation !== this.generation) return false;
      this.set({ status: 'ready', userId, savedAt, home });
      return true;
    });
    this.queue = write.catch(() => undefined);
    return write;
  }

  private set(snapshot: HomeSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

/** The app's Home snapshot, on AsyncStorage. Issues are reported by code only. */
export function createAppHomeSnapshotStore(): HomeSnapshotStore {
  return new HomeSnapshotStore({
    storage: AsyncStorage,
    report: (issue) => console.warn(`[home] home snapshot: ${issue.code}`),
  });
}
