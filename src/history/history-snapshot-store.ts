import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import { sessionHistoryItemSchema, type SessionHistoryItem } from '../api/history';
import {
  readStoredJson,
  type KeyValueStorage,
  type ParsedValue,
  type StorageIssue,
} from '../common/stored-json';

/** One key per user: a user never sees another's history, and sign-out keeps it. */
export const historySnapshotKey = (userId: string) => `focus-forest/history/v1/${userId}`;

/** Technical bound on the saved history, not Product configuration. */
export const HISTORY_SNAPSHOT_MAX = 100;

export interface HistorySnapshot {
  status: 'inactive' | 'restoring' | 'ready' | 'unavailable';
  userId: string | null;
  /** When the server last answered what is saved (epoch ms); null when nothing is. */
  savedAt: number | null;
  /** The newest sessions the server last answered, in its order. */
  items: SessionHistoryItem[];
}

export interface HistorySnapshotStoreOptions {
  storage: KeyValueStorage;
  report: (issue: StorageIssue) => void;
}

const documentSchema = z.strictObject({
  version: z.literal(1),
  savedAt: z.number().int().nonnegative(),
  items: z.array(sessionHistoryItemSchema).max(HISTORY_SNAPSHOT_MAX),
});

function parseDocument(
  value: unknown,
): ParsedValue<{ savedAt: number; items: SessionHistoryItem[] }> {
  const version = (value as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version !== 1) {
    return { ok: false, reason: 'unsupported_version' };
  }
  const parsed = documentSchema.safeParse(value);
  return parsed.success
    ? { ok: true, value: { savedAt: parsed.data.savedAt, items: parsed.data.items } }
    : { ok: false, reason: 'invalid_state' };
}

const INACTIVE: HistorySnapshot = { status: 'inactive', userId: null, savedAt: null, items: [] };

/**
 * The user's last loaded focus history, saved so History stays useful offline (like the saved
 * topic lists). Only what the server answered, newest first, at most `HISTORY_SNAPSHOT_MAX`; no
 * cursor, so it is shown, never paged. A read cache: a corrupt entry is moved aside and the
 * snapshot starts empty.
 */
export class HistorySnapshotStore {
  private snapshot: HistorySnapshot = INACTIVE;
  private listeners = new Set<() => void>();
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: HistorySnapshotStoreOptions) {}

  getSnapshot = (): HistorySnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  activate(userId: string): Promise<HistorySnapshot> {
    const generation = ++this.generation;
    this.set({ status: 'restoring', userId, savedAt: null, items: [] });
    const read = this.queue.then(async () => {
      if (generation !== this.generation) return this.snapshot;
      const { storage, report } = this.options;
      const stored = await readStoredJson(
        storage,
        historySnapshotKey(userId),
        parseDocument,
        report,
      );
      if (generation !== this.generation) return this.snapshot;
      this.set({
        status: stored.kind === 'unavailable' ? 'unavailable' : 'ready',
        userId,
        savedAt: stored.kind === 'ok' ? stored.value.savedAt : null,
        items: stored.kind === 'ok' ? stored.value.items : [],
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

  /** Saves the history the server answered for `userId` (the active user). True once stored. */
  save(userId: string, items: readonly SessionHistoryItem[], savedAt: number): Promise<boolean> {
    const generation = this.generation;
    const write = this.queue.then(async () => {
      const { status, userId: owner } = this.snapshot;
      if (generation !== this.generation || status !== 'ready' || owner !== userId) return false;
      const kept = items.slice(0, HISTORY_SNAPSHOT_MAX);
      try {
        await this.options.storage.setItem(
          historySnapshotKey(userId),
          JSON.stringify({ version: 1, savedAt, items: kept }),
        );
      } catch {
        this.options.report({ code: 'write_failed' });
        return false;
      }
      if (generation !== this.generation) return false;
      this.set({ status: 'ready', userId, savedAt, items: kept });
      return true;
    });
    this.queue = write.catch(() => undefined);
    return write;
  }

  private set(snapshot: HistorySnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

/** The app's history snapshot, on AsyncStorage. Issues are reported by code only. */
export function createAppHistorySnapshotStore(): HistorySnapshotStore {
  return new HistorySnapshotStore({
    storage: AsyncStorage,
    report: (issue) => console.warn(`[history] history snapshot: ${issue.code}`),
  });
}
