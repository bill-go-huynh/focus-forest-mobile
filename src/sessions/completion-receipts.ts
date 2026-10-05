import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import { storedSessionSchema, type FocusSession } from '../api/sessions';
import {
  readStoredJson,
  type KeyValueStorage,
  type ParsedValue,
  type StorageIssue,
} from '../common/stored-json';

/** One key per user: a user never sees another's receipts, and sign-out keeps them. */
export const completionReceiptsKey = (userId: string) =>
  `focus-forest/completion-receipts/v1/${userId}`;

/** Technical bound on this local cache, not Product configuration. */
export const COMPLETION_RECEIPTS_MAX = 20;

export interface CompletionReceiptsSnapshot {
  status: 'inactive' | 'restoring' | 'ready' | 'unavailable';
  userId: string | null;
  /** Oldest confirmed first; a newer answer for a session replaces it in place. */
  receipts: FocusSession[];
}

export interface CompletionReceiptsOptions {
  storage: KeyValueStorage;
  report: (issue: StorageIssue) => void;
}

const documentSchema = z.strictObject({
  version: z.literal(1),
  receipts: z
    .array(storedSessionSchema)
    .max(COMPLETION_RECEIPTS_MAX)
    .refine((receipts) => new Set(receipts.map((r) => r.id)).size === receipts.length),
});

function parseDocument(value: unknown): ParsedValue<FocusSession[]> {
  const version = (value as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version !== 1) {
    return { ok: false, reason: 'unsupported_version' };
  }
  const parsed = documentSchema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data.receipts }
    : { ok: false, reason: 'invalid_state' };
}

const INACTIVE: CompletionReceiptsSnapshot = { status: 'inactive', userId: null, receipts: [] };

/** The server's last answer for this session, if the device kept one. */
export function receiptFor(
  snapshot: CompletionReceiptsSnapshot,
  sessionId: string,
): FocusSession | null {
  return snapshot.receipts.find((receipt) => receipt.id === sessionId) ?? null;
}

/**
 * The server's answers for the user's most recent sessions (PUT, and PATCH …/note), kept on the
 * device so Session Completion can be opened by id after a restart (a tapped notification): the
 * API has no lookup by id. A read cache, not product truth and not local history: only validated
 * answers, never a note waiting to be sent, at most `COMPLETION_RECEIPTS_MAX`. A corrupt entry
 * is moved aside and the cache starts empty; the timer and the queues never depend on it.
 */
export class CompletionReceipts {
  private snapshot: CompletionReceiptsSnapshot = INACTIVE;
  private listeners = new Set<() => void>();
  private generation = 0;
  // Reads and writes, one at a time: a keep made during the read waits for it.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: CompletionReceiptsOptions) {}

  getSnapshot = (): CompletionReceiptsSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  activate(userId: string): Promise<CompletionReceiptsSnapshot> {
    const generation = ++this.generation;
    this.set({ status: 'restoring', userId, receipts: [] });
    const read = this.queue.then(async () => {
      if (generation !== this.generation) return this.snapshot;
      const { storage, report } = this.options;
      const stored = await readStoredJson(
        storage,
        completionReceiptsKey(userId),
        parseDocument,
        report,
      );
      if (generation !== this.generation) return this.snapshot;
      this.set({
        status: stored.kind === 'unavailable' ? 'unavailable' : 'ready',
        userId,
        receipts: stored.kind === 'ok' ? stored.value : [],
      });
      return this.snapshot;
    });
    this.queue = read.catch(() => undefined);
    return read;
  }

  /** Forgets the receipts in memory (sign-out). Storage keeps them. */
  deactivate(): void {
    this.generation += 1;
    this.set(INACTIVE);
  }

  /**
   * Stores the server's answer for `userId` (who must be the active user), replacing an earlier
   * one for the same session; the oldest leaves beyond the bound. Resolves true once stored.
   */
  keep(userId: string, session: FocusSession): Promise<boolean> {
    const generation = this.generation;
    const write = this.queue.then(async () => {
      const { status, userId: owner, receipts } = this.snapshot;
      if (generation !== this.generation || status !== 'ready' || owner !== userId) return false;
      const next = receipts.some((receipt) => receipt.id === session.id)
        ? receipts.map((receipt) => (receipt.id === session.id ? session : receipt))
        : [...receipts, session].slice(-COMPLETION_RECEIPTS_MAX);
      try {
        await this.options.storage.setItem(
          completionReceiptsKey(userId),
          JSON.stringify({ version: 1, receipts: next }),
        );
      } catch {
        this.options.report({ code: 'write_failed' });
        return false;
      }
      if (generation !== this.generation) return false;
      this.set({ status: 'ready', userId, receipts: next });
      return true;
    });
    this.queue = write.catch(() => undefined);
    return write;
  }

  private set(snapshot: CompletionReceiptsSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

/** The app's completion receipts, on AsyncStorage. Issues are reported by code only. */
export function createAppCompletionReceipts(): CompletionReceipts {
  return new CompletionReceipts({
    storage: AsyncStorage,
    report: (issue) => console.warn(`[sessions] completion receipts: ${issue.code}`),
  });
}
