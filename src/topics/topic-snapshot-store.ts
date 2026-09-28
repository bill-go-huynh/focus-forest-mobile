import { z } from 'zod';

import { topicSchema, type Topic, type TopicListFilter } from '../api/topics';
import {
  readStoredJson,
  type KeyValueStorage,
  type ParsedValue,
  type StorageIssue,
} from '../common/stored-json';

/** One key per user: a user never sees another's topics, and sign-out keeps them. */
export const topicSnapshotKey = (userId: string) => `focus-forest/topics/v1/${userId}`;

const ALL_VARIANTS = [
  'all:created',
  'all:recent',
  'active:created',
  'active:recent',
  'archived:created',
  'archived:recent',
] as const;
export type TopicListVariant = (typeof ALL_VARIANTS)[number];

/** Names a list the way the server orders it, e.g. `active:recent`. */
export function topicListVariant(filter: TopicListFilter = {}): TopicListVariant {
  return `${filter.status ?? 'all'}:${filter.sort ?? 'created'}` as TopicListVariant;
}

/** A list as the server last answered it, and when (epoch milliseconds). */
export interface SavedTopicList {
  savedAt: number;
  topics: Topic[];
}

export type SavedTopicLists = Partial<Record<TopicListVariant, SavedTopicList>>;

/**
 * `inactive`: nobody is signed in. `restoring`: reading the user's snapshot. `ready`: known
 * (maybe empty). `unavailable`: storage could not be read, so nothing is written over it.
 */
/**
 * A topic the server confirmed (a create answered 201/200) that the saved picker list does not
 * have yet, because that list is older or was never fetched. Server data, never pending.
 */
export interface UnlistedTopic {
  /** When the server answered with it (epoch ms). */
  confirmedAt: number;
  topic: Topic;
}

export type UnlistedTopics = Record<string, UnlistedTopic>;

export interface TopicSnapshot {
  status: 'inactive' | 'restoring' | 'ready' | 'unavailable';
  userId: string | null;
  lists: SavedTopicLists;
  unlisted: UnlistedTopics;
}

/** The list the picker shows. Unlisted topics wait until it is confirmed after them. */
const PICKER_VARIANT: TopicListVariant = 'active:recent';

const savedListSchema = z.strictObject({
  savedAt: z.number().int().nonnegative(),
  topics: z.array(topicSchema),
});

const unlistedSchema = z
  .record(
    z.string(),
    z.strictObject({ confirmedAt: z.number().int().nonnegative(), topic: topicSchema }),
  )
  .refine((entries) => Object.entries(entries).every(([id, entry]) => entry.topic.id === id));

// `unlisted` is optional, so snapshots saved before it existed still read as version 1.
const documentSchema = z.strictObject({
  version: z.literal(1),
  lists: z.partialRecord(z.enum(ALL_VARIANTS), savedListSchema),
  unlisted: unlistedSchema.optional(),
});

interface SavedDocument {
  lists: SavedTopicLists;
  unlisted: UnlistedTopics;
}

function parseDocument(value: unknown): ParsedValue<SavedDocument> {
  const version = (value as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version !== 1) {
    return { ok: false, reason: 'unsupported_version' };
  }
  const parsed = documentSchema.safeParse(value);
  return parsed.success
    ? { ok: true, value: { lists: parsed.data.lists, unlisted: parsed.data.unlisted ?? {} } }
    : { ok: false, reason: 'invalid_state' };
}

const INACTIVE: TopicSnapshot = { status: 'inactive', userId: null, lists: {}, unlisted: {} };

/**
 * The last topic lists the server confirmed for the signed-in user, kept on the device so the
 * picker is not empty when the app starts offline. A read cache, never the source of truth:
 * lists are saved only from server answers, and each keeps the time it was confirmed.
 */
export class TopicSnapshotStore {
  private snapshot: TopicSnapshot = INACTIVE;
  private listeners = new Set<() => void>();
  // Bumped on every activate and deactivate, so work for a previous user never lands.
  private generation = 0;
  private writes: Promise<unknown> = Promise.resolve();
  // Lists read back from the device in this launch, as opposed to answers of this launch.
  private fromDevice = new WeakSet<Topic[]>();

  constructor(
    private readonly options: {
      storage: KeyValueStorage;
      report: (issue: StorageIssue) => void;
    },
  ) {}

  getSnapshot = (): TopicSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Reads the user's saved lists. `onLoaded` receives them before the status turns ready, so
   * a caller can show them before anything waits on the server.
   */
  async activate(
    userId: string,
    onLoaded?: (lists: SavedTopicLists) => void,
  ): Promise<TopicSnapshot> {
    const generation = ++this.generation;
    this.set({ status: 'restoring', userId, lists: {}, unlisted: {} });
    const { storage, report } = this.options;
    const read = await readStoredJson(storage, topicSnapshotKey(userId), parseDocument, report);
    if (generation !== this.generation) return this.snapshot;

    const { lists, unlisted } = read.kind === 'ok' ? read.value : { lists: {}, unlisted: {} };
    for (const list of Object.values(lists)) this.fromDevice.add(list.topics);
    onLoaded?.(lists);
    this.set({
      status: read.kind === 'unavailable' ? 'unavailable' : 'ready',
      userId,
      lists,
      unlisted,
    });
    return this.snapshot;
  }

  /** Forgets the lists in memory (sign-out). Storage keeps them for the user's next sign-in. */
  deactivate(): void {
    this.generation += 1;
    this.set(INACTIVE);
  }

  /** True for a list read back from the device, not yet replaced by a server answer. */
  isFromDevice(topics: Topic[]): boolean {
    return this.fromDevice.has(topics);
  }

  /**
   * Saves a list the server answered for `userId`. Ignored unless that user is the one
   * signed in, and when storage could not be read. Resolves false when the write failed; the
   * list is still kept in memory for this launch.
   */
  save(
    userId: string,
    filter: TopicListFilter,
    topics: Topic[],
    savedAt: number,
  ): Promise<boolean> {
    if (!this.acceptsWritesFor(userId)) return Promise.resolve(false);
    const variant = topicListVariant(filter);
    // An answer to an older request (one that was cancelled and finished late) never
    // replaces a newer list: the newer one is already stored.
    const current = this.snapshot.lists[variant];
    if (current && current.savedAt > savedAt) return this.writes.then(() => true);
    const lists = { ...this.snapshot.lists, [variant]: { savedAt, topics } };
    // The picker list takes over an unlisted topic once it has it, or once it was asked for
    // strictly after the topic was confirmed and still lacks it (so it is no longer active).
    // A list asked for earlier (or in the same millisecond) may predate the create: kept.
    const unlisted =
      variant === PICKER_VARIANT
        ? Object.fromEntries(
            Object.entries(this.snapshot.unlisted).filter(
              ([id, entry]) =>
                !topics.some((topic) => topic.id === id) && entry.confirmedAt >= savedAt,
            ),
          )
        : this.snapshot.unlisted;
    return this.store(userId, lists, unlisted);
  }

  /**
   * Keeps a topic the server just confirmed, so it stays visible offline even when no saved
   * list has it yet (a first-ever create). Resolves true once stored.
   */
  rememberUnlisted(userId: string, topic: Topic, confirmedAt: number): Promise<boolean> {
    if (!this.acceptsWritesFor(userId)) return Promise.resolve(false);
    const unlisted = { ...this.snapshot.unlisted, [topic.id]: { confirmedAt, topic } };
    return this.store(userId, this.snapshot.lists, unlisted);
  }

  /** Replaces an unlisted topic with a newer server answer for it (an edit, an archive). */
  updateUnlisted(userId: string, topic: Topic): Promise<boolean> {
    const entry = this.snapshot.unlisted[topic.id];
    if (!entry || !this.acceptsWritesFor(userId)) return Promise.resolve(true);
    const unlisted = { ...this.snapshot.unlisted, [topic.id]: { ...entry, topic } };
    return this.store(userId, this.snapshot.lists, unlisted);
  }

  private acceptsWritesFor(userId: string): boolean {
    return this.snapshot.userId === userId && this.snapshot.status === 'ready';
  }

  private store(userId: string, lists: SavedTopicLists, unlisted: UnlistedTopics) {
    this.set({ status: 'ready', userId, lists, unlisted });
    const document = JSON.stringify({ version: 1, lists, unlisted });
    const write = this.writes.then(() => this.write(userId, document));
    this.writes = write;
    return write;
  }

  private async write(userId: string, document: string): Promise<boolean> {
    try {
      await this.options.storage.setItem(topicSnapshotKey(userId), document);
      return true;
    } catch {
      this.options.report({ code: 'write_failed' });
      return false;
    }
  }

  private set(snapshot: TopicSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
