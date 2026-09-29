import { type QueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { createTopic, useSession, type ApiClient, type Topic, type TopicStatus } from '../api';
import type { KeyValueStorage, StorageIssue } from '../common/stored-json';
import { applyServerTopic, topicsRootKey, useRecentTopics, useTopics } from './queries';
import { useTopicSnapshot } from './TopicCacheProvider';
import {
  pendingTopicsOf,
  TopicCreateQueue,
  type PendingTopic,
  type TopicCreateQueueSnapshot,
} from './topic-create-queue';
import type { SavedTopicLists, TopicSnapshotStore, UnlistedTopics } from './topic-snapshot-store';

/**
 * The create queue wired to the API and the M2.4 caches: a create is sent with PUT
 * /me/topics/:id (the answer validated by `topicSchema`), and a created topic is confirmed by
 * putting it in the cached and saved lists; the queue drops the create only when that is stored.
 */
export function createTopicCreateQueue({
  storage,
  client,
  queryClient,
  snapshots,
  createId,
  report,
  now = Date.now,
}: {
  storage: KeyValueStorage;
  client: ApiClient;
  queryClient: QueryClient;
  snapshots: TopicSnapshotStore;
  createId: () => string;
  report: (issue: StorageIssue) => void;
  now?: () => number;
}): TopicCreateQueue {
  return new TopicCreateQueue({
    storage,
    now,
    createId,
    report,
    send: (id, payload) => createTopic(client, id, payload),
    // Durable before the queue lets go: the topic is kept as confirmed on its own first, so
    // it survives even when no saved list can hold it yet, then added to the lists there are.
    confirm: async (userId, topic) => {
      const remembered = await snapshots.rememberUnlisted(userId, topic, now());
      if (!remembered) return false;
      const listed = await applyServerTopic(queryClient, snapshots, userId, topic, {
        created: true,
      });
      if (listed) void queryClient.invalidateQueries({ queryKey: topicsRootKey });
      return listed;
    },
  });
}

const QueueContext = createContext<TopicCreateQueue | null>(null);

/**
 * Reads the signed-in user's queued creates, then sends them: at launch and after every
 * sign-in. Sign-out forgets them in memory; storage keeps them.
 */
export function TopicCreateQueueProvider({
  queue,
  children,
}: {
  queue: TopicCreateQueue;
  children: ReactNode;
}) {
  const { status, user } = useSession();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;

  useEffect(() => {
    if (!userId) {
      queue.deactivate();
      return;
    }
    void queue.activate(userId).then((snapshot) => {
      if (snapshot.userId === userId && snapshot.status === 'ready') void queue.flush();
    });
  }, [queue, userId]);

  return <QueueContext.Provider value={queue}>{children}</QueueContext.Provider>;
}

export function useTopicCreateQueue(): TopicCreateQueue {
  const queue = useContext(QueueContext);
  if (!queue) throw new Error('useTopicCreateQueue must be used inside TopicCreateQueueProvider.');
  return queue;
}

export function useTopicCreateQueueSnapshot(): TopicCreateQueueSnapshot {
  const queue = useTopicCreateQueue();
  return useSyncExternalStore(queue.subscribe, queue.getSnapshot);
}

/** A picker entry: a topic the server confirmed, or one only this device knows yet. */
export type PickerTopic = { kind: 'confirmed'; topic: Topic } | PendingTopic;

/**
 * The picker's read model: the recent active topics as the server ordered them; then active
 * topics the server confirmed that this list does not have yet (created since it was saved),
 * in creation order, which is where the server puts new unused topics; then the queued
 * creates. Each topic shows once, confirmed whenever the server has confirmed it.
 */
export function usePickerTopics() {
  const recent = useRecentTopics();
  const { unlisted } = useTopicSnapshot();
  const { items: queued } = useTopicCreateQueueSnapshot();
  const items = useMemo((): PickerTopic[] => {
    const confirmed = withUnlisted(recent.data ?? [], unlisted, 'active');
    const known = new Set(confirmed.map((topic) => topic.id));
    const pending = pendingTopicsOf(queued).filter((topic) => !known.has(topic.id));
    return [...confirmed.map((topic) => ({ kind: 'confirmed' as const, topic })), ...pending];
  }, [recent.data, unlisted, queued]);
  return { items, recent };
}

/**
 * A server list, then the topics with this status the server confirmed that the list does not
 * have yet (created since it was saved), in creation order, which is where the server puts
 * them. Each topic once.
 */
function withUnlisted(listed: Topic[], unlisted: UnlistedTopics, status: TopicStatus): Topic[] {
  const known = new Set(listed.map((topic) => topic.id));
  const extra = Object.values(unlisted)
    .map((entry) => entry.topic)
    .filter((topic) => topic.status === status && !known.has(topic.id))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return [...listed, ...extra];
}

/**
 * The Topics screen's read model for one status, in the server's order (creation order):
 * the confirmed topics, then (for active) the queued creates, each with its queue item, so the
 * screen can show its sync state and whether it may still be revised.
 */
export function useManagedTopics(status: TopicStatus) {
  const list = useTopics({ status });
  const { unlisted } = useTopicSnapshot();
  const { items: queued } = useTopicCreateQueueSnapshot();
  const confirmed = useMemo(
    () => (list.data === undefined ? undefined : withUnlisted(list.data, unlisted, status)),
    [list.data, unlisted, status],
  );
  const pending = useMemo(() => {
    if (status !== 'active') return [];
    const known = new Set(confirmed?.map((topic) => topic.id));
    return queued.filter((item) => !known.has(item.id));
  }, [confirmed, queued, status]);
  return { confirmed, pending, list };
}

/** What a screen shows for a topic: its name, icon, and color. */
export interface TopicIdentity {
  name: string;
  icon: string;
  color: string;
}

/**
 * A topic's identity from what the device holds, for a screen that has only its id (the Focus
 * timer): the newest server answer among the saved lists and the confirmed-but-unlisted topics
 * (archived ones included), else the create still queued for it. Null when nothing is known;
 * the caller shows a neutral stand-in. Reads only: nothing is fetched or stored.
 */
export function useTopicIdentity(topicId: string): TopicIdentity | null {
  const { lists, unlisted } = useTopicSnapshot();
  const { items: queued } = useTopicCreateQueueSnapshot();
  return useMemo(() => {
    const confirmed = newestConfirmed(topicId, lists, unlisted);
    if (confirmed) return { name: confirmed.name, icon: confirmed.icon, color: confirmed.color };
    const pending = queued.find((item) => item.id === topicId);
    return pending
      ? { name: pending.payload.name, icon: pending.payload.icon, color: pending.payload.color }
      : null;
  }, [topicId, lists, unlisted, queued]);
}

function newestConfirmed(
  topicId: string,
  lists: SavedTopicLists,
  unlisted: UnlistedTopics,
): Topic | null {
  const found = Object.values(lists).map((list) => ({
    at: list.savedAt,
    topic: list.topics.find((topic) => topic.id === topicId),
  }));
  const entry = unlisted[topicId];
  if (entry) found.push({ at: entry.confirmedAt, topic: entry.topic });
  let newest: { at: number; topic: Topic } | null = null;
  for (const { at, topic } of found) {
    if (topic && (!newest || at > newest.at)) newest = { at, topic };
  }
  return newest?.topic ?? null;
}
