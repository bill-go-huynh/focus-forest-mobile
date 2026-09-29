import { z } from 'zod';

import { HttpError, InvalidResponseError, NetworkError, UnauthenticatedError } from '../api/errors';
import type { FocusSession } from '../api/sessions';
import {
  readStoredJson,
  type KeyValueStorage,
  type ParsedValue,
  type StorageIssue,
} from '../common/stored-json';
import { canonicalNote, noteError, NOTE_MAX_LENGTH } from './session-note';

/** One key per user: a user never sees or sends another's notes, and sign-out keeps them. */
export const sessionNoteOutboxKey = (userId: string) => `focus-forest/session-notes/v1/${userId}`;

/**
 * `pending`: waiting for its session to be on the server, or to be sent again. `needs_attention`:
 * an answer the app cannot resolve by itself (a refusal, or one that breaks the contract); kept,
 * never retried automatically, never dropped.
 */
export type QueuedNoteState = 'pending' | 'needs_attention';
export type NoteAttentionReason = 'rejected' | 'invalid_response';

export interface QueuedNote {
  sessionId: string;
  /** Canonical (A2.6): null clears the note. */
  note: string | null;
  /** Bumped on every save, so an answer for an older value never clears a newer one. */
  revision: number;
  state: QueuedNoteState;
  reason: NoteAttentionReason | null;
  savedAt: number;
}

export interface SessionNoteOutboxSnapshot {
  status: 'inactive' | 'restoring' | 'ready' | 'unavailable';
  userId: string | null;
  items: QueuedNote[];
  /** Sessions whose note the server confirmed in this process, as it answered them. */
  confirmed: Record<string, FocusSession>;
}

export type NoteSaveResult =
  { ok: true } | { ok: false; reason: 'invalid_note' | 'not_ready' | 'storage_failed' };

export interface SessionNoteOutboxOptions {
  storage: KeyValueStorage;
  now: () => number;
  report: (issue: StorageIssue) => void;
  /** PATCH /me/sessions/:id/note, answering the validated session. */
  send: (sessionId: string, note: string | null) => Promise<FocusSession>;
  /**
   * Whether the server has confirmed this session (it has left the session outbox, which only
   * happens after a validated answer); null while that is not known (the outbox is not read).
   */
  isSessionConfirmed: (userId: string, sessionId: string) => boolean | null;
  /**
   * Stores the validated answer durably (the completion receipt), before the note may leave
   * the queue; resolves false when it could not be. Until then the note stays queued and is
   * sent again (PATCH is idempotent by value).
   */
  keepReceipt?: (userId: string, session: FocusSession) => Promise<boolean>;
}

const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const itemSchema = z
  .strictObject({
    sessionId: z.string().regex(LOWERCASE_UUID),
    note: z
      .string()
      .refine((note) => note !== '' && canonicalNote(note) === note)
      .refine((note) => [...note].length <= NOTE_MAX_LENGTH)
      .nullable(),
    revision: z.number().int().positive(),
    state: z.enum(['pending', 'needs_attention']),
    reason: z.enum(['rejected', 'invalid_response']).nullable(),
    savedAt: z.number().int().nonnegative(),
  })
  .refine((item) => (item.state === 'needs_attention') === (item.reason !== null));

const documentSchema = z.strictObject({
  version: z.literal(1),
  items: z
    .array(itemSchema)
    .refine((items) => new Set(items.map((item) => item.sessionId)).size === items.length),
});

function parseDocument(value: unknown): ParsedValue<QueuedNote[]> {
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
  | { kind: 'sent'; session: FocusSession }
  /** Unknown whether it was stored, or refused for now: keep it. `stop`: out of reach. */
  | { kind: 'retry'; stop: boolean }
  | { kind: 'attention'; reason: NoteAttentionReason };

function classify(error: unknown): Outcome {
  if (error instanceof NetworkError || error instanceof UnauthenticatedError) {
    return { kind: 'retry', stop: true };
  }
  if (error instanceof InvalidResponseError)
    return { kind: 'attention', reason: 'invalid_response' };
  if (!(error instanceof HttpError)) return { kind: 'retry', stop: true };
  // 5xx, and a 404: the session may not be observable yet; the note waits for the next flush.
  if (error.status >= 500 || error.status === 404) return { kind: 'retry', stop: false };
  return { kind: 'attention', reason: 'rejected' };
}

const INACTIVE: SessionNoteOutboxSnapshot = {
  status: 'inactive',
  userId: null,
  items: [],
  confirmed: {},
};

/**
 * Notes waiting for the server, per user (A2.6: PATCH /me/sessions/:id/note). A note is stored on
 * the device before anything else, so it survives offline, a kill, and sign-out. It is sent only
 * once its session is confirmed on the server (after PUT, never before), the same value until
 * answered (PATCH is idempotent by value), and removed only after a validated answer for that
 * very value. Kept apart from the session outbox, whose item leaves at the PUT answer while a
 * note can still be written or edited after it.
 */
export class SessionNoteOutbox {
  private snapshot: SessionNoteOutboxSnapshot = INACTIVE;
  private listeners = new Set<() => void>();
  private generation = 0;
  private writes: Promise<unknown> = Promise.resolve();
  private flushing: { generation: number; run: Promise<void> } | null = null;

  constructor(private readonly options: SessionNoteOutboxOptions) {}

  getSnapshot = (): SessionNoteOutboxSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Reads the user's notes. A corrupt entry is moved aside first, never sent. */
  async activate(userId: string): Promise<SessionNoteOutboxSnapshot> {
    const generation = ++this.generation;
    this.set({ status: 'restoring', userId, items: [], confirmed: {} });
    const { storage, report } = this.options;
    const read = await readStoredJson(
      storage,
      sessionNoteOutboxKey(userId),
      parseDocument,
      report,
      {
        removeOnlyIfKept: true,
      },
    );
    if (generation !== this.generation) return this.snapshot;
    this.set({
      status: read.kind === 'unavailable' ? 'unavailable' : 'ready',
      userId,
      items: read.kind === 'ok' ? read.value : [],
      confirmed: {},
    });
    return this.snapshot;
  }

  /** Forgets the notes in memory (sign-out). Storage keeps them for the user's next sign-in. */
  deactivate(): void {
    this.generation += 1;
    this.set(INACTIVE);
  }

  /** Stores the note to send for this session, replacing a queued one. Blank clears it. */
  async save(userId: string, sessionId: string, text: string): Promise<NoteSaveResult> {
    if (noteError(text) !== null) return { ok: false, reason: 'invalid_note' };
    if (!this.readyFor(userId)) return { ok: false, reason: 'not_ready' };
    const note = canonicalNote(text);
    const stored = await this.commit(this.generation, (items) => {
      const existing = items.find((item) => item.sessionId === sessionId);
      const next: QueuedNote = {
        sessionId,
        note,
        revision: (existing?.revision ?? 0) + 1,
        state: 'pending',
        reason: null,
        savedAt: this.options.now(),
      };
      return existing
        ? items.map((item) => (item.sessionId === sessionId ? next : item))
        : [...items, next];
    });
    if (stored) return { ok: true };
    return { ok: false, reason: this.readyFor(userId) ? 'storage_failed' : 'not_ready' };
  }

  /** Sends every note whose session the server has confirmed. Overlapping calls share one run. */
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
    for (;;) {
      if (generation !== this.generation || !this.ready()) return;
      const userId = this.snapshot.userId as string;
      const next = this.snapshot.items.find(
        (item) =>
          item.state === 'pending' &&
          !tried.has(item.sessionId) &&
          this.options.isSessionConfirmed(userId, item.sessionId) === true,
      );
      if (!next) return;
      tried.add(next.sessionId);

      let outcome: Outcome;
      try {
        const session = await this.options.send(next.sessionId, next.note);
        outcome =
          session.id === next.sessionId && session.note === next.note
            ? { kind: 'sent', session }
            : { kind: 'attention', reason: 'invalid_response' };
      } catch (error) {
        outcome = classify(error);
      }
      if (generation !== this.generation) return;

      if (outcome.kind === 'sent') {
        const { session } = outcome;
        const kept = (await this.options.keepReceipt?.(userId, session).catch(() => false)) ?? true;
        if (generation !== this.generation) return;
        if (!kept) continue;
        // Only this value is confirmed: a newer edit stays queued.
        await this.commit(generation, (items) =>
          items.some((item) => item.sessionId === next.sessionId && item.revision === next.revision)
            ? items.filter((item) => item.sessionId !== next.sessionId)
            : null,
        );
        if (generation === this.generation) {
          this.set({
            ...this.snapshot,
            confirmed: { ...this.snapshot.confirmed, [next.sessionId]: session },
          });
        }
      } else if (outcome.kind === 'attention') {
        const { reason } = outcome;
        await this.commit(generation, (items) =>
          items.some((item) => item.sessionId === next.sessionId && item.revision === next.revision)
            ? items.map((item) =>
                item.sessionId === next.sessionId
                  ? { ...item, state: 'needs_attention' as const, reason }
                  : item,
              )
            : null,
        );
      } else if (outcome.stop) {
        return;
      }
    }
  }

  /** Writes the changed list first and shows it only once stored; null changes nothing. */
  private commit(
    generation: number,
    change: (items: QueuedNote[]) => QueuedNote[] | null,
  ): Promise<boolean> {
    const write = this.writes.then(async () => {
      if (generation !== this.generation || !this.ready()) return false;
      const { userId, items, confirmed } = this.snapshot;
      const next = change(items);
      if (!next || !userId) return false;
      try {
        await this.options.storage.setItem(
          sessionNoteOutboxKey(userId),
          JSON.stringify({ version: 1, items: next }),
        );
      } catch {
        this.options.report({ code: 'write_failed' });
        return false;
      }
      if (generation !== this.generation) return false;
      this.set({ status: 'ready', userId, items: next, confirmed });
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

  private set(snapshot: SessionNoteOutboxSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
