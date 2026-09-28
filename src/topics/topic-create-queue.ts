import { z } from 'zod';

import { HttpError, InvalidResponseError, NetworkError, UnauthenticatedError } from '../api/errors';
import { TOPIC_COLORS, topicErrorCode, type NewTopicFields, type Topic } from '../api/topics';
import {
  readStoredJson,
  type KeyValueStorage,
  type ParsedValue,
  type StorageIssue,
} from '../common/stored-json';

/** One key per user: a user never sees another's queued creates, and sign-out keeps them. */
export const topicCreateQueueKey = (userId: string) =>
  `focus-forest/topic-create-queue/v1/${userId}`;

/** Exactly what PUT /me/topics/:id receives, canonical: resent unchanged on every retry. */
export interface CreateTopicPayload {
  name: string;
  icon: string;
  color: string;
  description: string | null;
}

/**
 * `pending`: waiting to be sent, or sent without a known answer. `needs_name_change`: the
 * server answered `topic_name_taken`, so nothing was created and the user picks another name.
 * `needs_attention`: an answer the app cannot resolve by itself (`topic_id_conflict`, another
 * 4xx, a response that breaks the contract); kept, never retried automatically.
 */
export type QueuedCreateState = 'pending' | 'needs_name_change' | 'needs_attention';

export interface QueuedTopicCreate {
  /** The client-generated lowercase id, kept for every attempt. */
  id: string;
  payload: CreateTopicPayload;
  state: QueuedCreateState;
  /**
   * True once this payload may have reached the server (it was sent and no answer proved it
   * was not created). From then on the payload is frozen: a retry must replay it exactly.
   */
  attempted: boolean;
  /** When the user created it (epoch ms): the order creates are sent in. */
  queuedAt: number;
}

/** A topic the server has not confirmed yet, as a picker shows it: no server fields. */
export interface PendingTopic {
  kind: 'pending';
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string | null;
  syncState: QueuedCreateState;
}

export interface TopicCreateQueueSnapshot {
  status: 'inactive' | 'restoring' | 'ready' | 'unavailable';
  userId: string | null;
  items: QueuedTopicCreate[];
}

export type EnqueueResult =
  | { ok: true; item: QueuedTopicCreate }
  | { ok: false; reason: 'not_ready' | 'invalid_fields' | 'invalid_id' | 'storage_failed' };

export type ReviseResult =
  | { ok: true; item: QueuedTopicCreate }
  | {
      ok: false;
      reason: 'not_ready' | 'not_found' | 'not_revisable' | 'invalid_fields' | 'storage_failed';
    };

export interface TopicCreateQueueOptions {
  storage: KeyValueStorage;
  now: () => number;
  createId: () => string;
  report: (issue: StorageIssue) => void;
  /** Sends one create (PUT /me/topics/:id) and returns the validated topic. */
  send: (id: string, payload: CreateTopicPayload) => Promise<Topic>;
  /**
   * Makes a created topic part of the user's confirmed topics (query cache and device
   * snapshot). Resolves true only when that is durable; the create stays queued otherwise.
   */
  confirm: (userId: string, topic: Topic) => Promise<boolean>;
}

/**
 * Trimmed and NFC, a blank description as null: how the API compares creates (A2.2), done
 * once so every retry sends the same values. Null when the fields can never be created.
 */
export function canonicalCreatePayload(fields: NewTopicFields): CreateTopicPayload | null {
  const name = fields.name.normalize('NFC').trim();
  const description = fields.description?.normalize('NFC').trim() || null;
  if (!name || !fields.icon || !TOPIC_COLORS.includes(fields.color)) return null;
  return { name, icon: fields.icon, color: fields.color, description };
}

const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const payloadSchema = z
  .strictObject({
    name: z.string(),
    icon: z.string(),
    color: z.string(),
    description: z.string().nullable(),
  })
  .refine((payload) => {
    const canonical = canonicalCreatePayload(payload);
    return canonical !== null && JSON.stringify(canonical) === JSON.stringify(payload);
  });

const documentSchema = z.strictObject({
  version: z.literal(1),
  items: z
    .array(
      z.strictObject({
        id: z.string().regex(LOWERCASE_UUID),
        payload: payloadSchema,
        state: z.enum(['pending', 'needs_name_change', 'needs_attention']),
        attempted: z.boolean(),
        queuedAt: z.number().int().nonnegative(),
      }),
    )
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
});

function parseDocument(value: unknown): ParsedValue<QueuedTopicCreate[]> {
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
  | { kind: 'created'; topic: Topic }
  /** Unknown whether it was created: keep it, frozen. `stop`: the server is out of reach. */
  | { kind: 'retry'; stop: boolean }
  | { kind: 'name_taken' }
  | { kind: 'attention' };

function classify(error: unknown): Outcome {
  if (error instanceof NetworkError || error instanceof UnauthenticatedError) {
    return { kind: 'retry', stop: true };
  }
  if (error instanceof HttpError) {
    if (error.status >= 500) return { kind: 'retry', stop: false };
    if (topicErrorCode(error) === 'topic_name_taken') return { kind: 'name_taken' };
    return { kind: 'attention' };
  }
  // A response that breaks the contract: the server may have created it, so the payload stays
  // frozen, and retrying cannot fix it.
  if (error instanceof InvalidResponseError) {
    return { kind: 'attention' };
  }
  // Anything else (configuration, an unexpected transport error): unknown, keep it frozen.
  return { kind: 'retry', stop: true };
}

const INACTIVE: TopicCreateQueueSnapshot = { status: 'inactive', userId: null, items: [] };

/**
 * The signed-in user's topic creates made while the server could not confirm them (offline
 * first session). Every change is stored before it shows; a create is marked `attempted`
 * before it is sent, so an uncertain attempt is only ever replayed with the same payload; an
 * item leaves the queue only after the created topic is durably confirmed. Flushes run one at
 * a time, in creation order, and a conflict does not hold back the others.
 */
export class TopicCreateQueue {
  private snapshot: TopicCreateQueueSnapshot = INACTIVE;
  private listeners = new Set<() => void>();
  // Bumped on every activate and deactivate, so work for a previous user never lands.
  private generation = 0;
  private writes: Promise<unknown> = Promise.resolve();
  private flushing: { generation: number; run: Promise<void> } | null = null;

  constructor(private readonly options: TopicCreateQueueOptions) {}

  getSnapshot = (): TopicCreateQueueSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Reads the user's queue. Does not flush: the caller flushes once the app can send. */
  async activate(userId: string): Promise<TopicCreateQueueSnapshot> {
    const generation = ++this.generation;
    this.set({ status: 'restoring', userId, items: [] });
    const { storage, report } = this.options;
    // Unsynced creates exist nowhere else: an entry is removed only once a copy is kept.
    const read = await readStoredJson(storage, topicCreateQueueKey(userId), parseDocument, report, {
      removeOnlyIfKept: true,
    });
    if (generation !== this.generation) return this.snapshot;
    this.set({
      status: read.kind === 'unavailable' ? 'unavailable' : 'ready',
      userId,
      items: read.kind === 'ok' ? read.value : [],
    });
    return this.snapshot;
  }

  /** Forgets the queue in memory (sign-out). Storage keeps it for the user's next sign-in. */
  deactivate(): void {
    this.generation += 1;
    this.set(INACTIVE);
  }

  /** The queued creates as the picker shows them, in creation order. */
  pendingTopics(): PendingTopic[] {
    return pendingTopicsOf(this.snapshot.items);
  }

  /**
   * True when no create for this topic is waiting, so the server has it (for a topic the app
   * got from the server). False while the queue is not known yet: never guess.
   */
  isTopicSynced(topicId: string): boolean {
    return (
      this.snapshot.status === 'ready' && !this.snapshot.items.some((item) => item.id === topicId)
    );
  }

  /** Queues a create with a new id, stored before it is answered; then tries to send it. */
  async enqueue(fields: NewTopicFields): Promise<EnqueueResult> {
    const payload = canonicalCreatePayload(fields);
    if (this.snapshot.status !== 'ready') return { ok: false, reason: 'not_ready' };
    if (!payload) return { ok: false, reason: 'invalid_fields' };
    let id: string;
    try {
      id = this.options.createId().toLowerCase();
    } catch {
      return { ok: false, reason: 'invalid_id' };
    }
    if (!LOWERCASE_UUID.test(id)) return { ok: false, reason: 'invalid_id' };
    const item: QueuedTopicCreate = {
      id,
      payload,
      state: 'pending',
      attempted: false,
      queuedAt: this.options.now(),
    };
    const stored = await this.commit(this.generation, (items) => [...items, item]);
    if (!stored) return { ok: false, reason: this.ready() ? 'storage_failed' : 'not_ready' };
    void this.flush();
    return { ok: true, item };
  }

  /**
   * Changes a queued create's fields, keeping its id. Only while no attempt can have created
   * it: never sent, or refused with `topic_name_taken`. After an uncertain attempt the create
   * must be confirmed first, then changed with an edit.
   */
  async revise(id: string, fields: NewTopicFields): Promise<ReviseResult> {
    if (!this.ready()) return { ok: false, reason: 'not_ready' };
    const payload = canonicalCreatePayload(fields);
    if (!payload) return { ok: false, reason: 'invalid_fields' };
    let refusal: 'not_found' | 'not_revisable' | null = null;
    let revised: QueuedTopicCreate | null = null;
    const stored = await this.commit(this.generation, (items) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) refusal = 'not_found';
      else if (!isRevisable(item)) refusal = 'not_revisable';
      if (refusal || !item) return null;
      revised = { ...item, payload, state: 'pending', attempted: false };
      const next = revised;
      return items.map((candidate) => (candidate.id === id ? next : candidate));
    });
    if (refusal) return { ok: false, reason: refusal };
    if (!stored || !revised) return { ok: false, reason: 'storage_failed' };
    void this.flush();
    return { ok: true, item: revised };
  }

  /** Sends every pending create, oldest first. Overlapping calls share one run per user. */
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
        (item) => item.state === 'pending' && !tried.has(item.id),
      );
      if (!next) return;
      tried.add(next.id);

      // Recorded before sending, so an attempt interrupted by a kill is replayed unchanged.
      const item = next.attempted ? next : await this.markAttempted(generation, next.id);
      if (!item) return;

      let outcome: Outcome;
      try {
        outcome = { kind: 'created', topic: await this.options.send(item.id, item.payload) };
      } catch (error) {
        outcome = classify(error);
      }
      if (generation !== this.generation) return;

      if (outcome.kind === 'created') {
        const confirmed = await this.options.confirm(userId, outcome.topic);
        if (generation !== this.generation) return;
        // Not durable yet: keep it; the next flush replays it (200) and confirms again.
        if (confirmed)
          await this.commit(generation, (items) => items.filter((i) => i.id !== item.id));
      } else if (outcome.kind === 'name_taken') {
        await this.update(generation, item.id, { state: 'needs_name_change', attempted: false });
      } else if (outcome.kind === 'attention') {
        await this.update(generation, item.id, { state: 'needs_attention' });
      } else if (outcome.stop) {
        return;
      }
    }
  }

  private async markAttempted(generation: number, id: string): Promise<QueuedTopicCreate | null> {
    let marked: QueuedTopicCreate | null = null;
    const stored = await this.commit(generation, (items) => {
      const item = items.find((candidate) => candidate.id === id);
      // Revised or resolved meanwhile: this flush leaves it.
      if (!item || item.state !== 'pending') return null;
      marked = { ...item, attempted: true };
      const next = marked;
      return items.map((candidate) => (candidate.id === id ? next : candidate));
    });
    return stored ? marked : null;
  }

  private update(generation: number, id: string, changes: Partial<QueuedTopicCreate>) {
    return this.commit(generation, (items) =>
      items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    );
  }

  /**
   * Applies a change to the stored queue, one at a time: the new list is written first and
   * shown only once stored. `change` returns null to change nothing. Resolves false when
   * nothing was stored.
   */
  private commit(
    generation: number,
    change: (items: QueuedTopicCreate[]) => QueuedTopicCreate[] | null,
  ): Promise<boolean> {
    const write = this.writes.then(async () => {
      if (generation !== this.generation || !this.ready()) return false;
      const { userId, items } = this.snapshot;
      const next = change(items);
      if (!next || !userId) return false;
      try {
        await this.options.storage.setItem(
          topicCreateQueueKey(userId),
          JSON.stringify({ version: 1, items: next }),
        );
      } catch {
        this.options.report({ code: 'write_failed' });
        return false;
      }
      if (generation !== this.generation) return false;
      this.set({ status: 'ready', userId, items: next });
      return true;
    });
    this.writes = write.catch(() => undefined);
    return write;
  }

  private ready(): boolean {
    return this.snapshot.status === 'ready' && this.snapshot.userId !== null;
  }

  private set(snapshot: TopicCreateQueueSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

function isRevisable(item: QueuedTopicCreate): boolean {
  return item.state === 'needs_name_change' || (item.state === 'pending' && !item.attempted);
}

/** Queued creates as a picker shows them: only what the user gave, and the sync state. */
export function pendingTopicsOf(items: QueuedTopicCreate[]): PendingTopic[] {
  return items.map(({ id, payload, state }) => ({
    kind: 'pending',
    id,
    ...payload,
    syncState: state,
  }));
}
