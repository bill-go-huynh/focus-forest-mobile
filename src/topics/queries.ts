import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  archiveTopic,
  createTopic,
  listTopics,
  restoreTopic,
  updateTopic,
  useApi,
  type ApiClient,
  type NewTopicFields,
  type Topic,
  type TopicChanges,
  type TopicListFilter,
} from '../api';
import { filterOfVariant, topicsQueryKey, topicsRootKey } from './query-keys';
import { useTopicSnapshot, useTopicSnapshotStore } from './TopicCacheProvider';
import type { TopicSnapshotStore } from './topic-snapshot-store';

export { invalidateTopicLists, topicsQueryKey, topicsRootKey } from './query-keys';

/**
 * One topic list as the server orders it (GET /me/topics). Each answer is saved for an offline
 * launch. `fromDeviceCache` is true while the list shown is the saved one, not yet confirmed
 * by the server in this launch; `dataUpdatedAt` is when the server last confirmed it.
 * `enabled: false` asks nothing until a screen needs the list.
 */
export function useTopics(filter: TopicListFilter = {}, { enabled = true } = {}) {
  const { client } = useApi();
  const store = useTopicSnapshotStore();
  const { status, userId } = useTopicSnapshot();
  const query = useQuery({
    queryKey: topicsQueryKey(filter),
    queryFn: async () => {
      // The list is the server's state at least as of the request: a topic confirmed after
      // the request began may be missing from it, and is kept aside until a later list.
      const requestedAt = Date.now();
      const topics = await listTopics(client, filter);
      if (userId) await store.save(userId, filter, topics, requestedAt);
      return topics;
    },
    // Waits for the saved lists, so they show before an offline request fails.
    enabled: enabled && userId !== null && (status === 'ready' || status === 'unavailable'),
  });
  return {
    ...query,
    fromDeviceCache: query.data !== undefined && store.isFromDevice(query.data),
  };
}

/** The picker's list: active topics, used ones by latest use first (A2.8). */
export function useRecentTopics() {
  return useTopics({ status: 'active', sort: 'recent' });
}

/** Creates a topic online with a caller-generated lowercase id. No offline queue here (M2.5). */
export function useCreateTopic() {
  return useTopicMutation(
    (client, { id, fields }: { id: string; fields: NewTopicFields }) =>
      createTopic(client, id, fields),
    { created: true },
  );
}

export function useUpdateTopic() {
  return useTopicMutation((client, { id, changes }: { id: string; changes: TopicChanges }) =>
    updateTopic(client, id, changes),
  );
}

export function useArchiveTopic() {
  return useTopicMutation((client, id: string) => archiveTopic(client, id));
}

export function useRestoreTopic() {
  return useTopicMutation((client, id: string) => restoreTopic(client, id));
}

/**
 * An online topic mutation. Its answer is the whole current topic (with its recent use), so
 * it replaces the cached copy wherever the topic is, and leaves the lists it no longer belongs
 * to. Then every list is asked again, so the order is always the server's.
 */
function useTopicMutation<V>(
  send: (client: ApiClient, variables: V) => Promise<Topic>,
  { created = false }: { created?: boolean } = {},
) {
  const { client } = useApi();
  const queryClient = useQueryClient();
  const store = useTopicSnapshotStore();
  const { userId } = useTopicSnapshot();
  return useMutation({
    mutationFn: (variables: V) => send(client, variables),
    onSuccess: (topic) => {
      void applyServerTopic(queryClient, store, userId, topic, { created });
      void queryClient.invalidateQueries({ queryKey: topicsRootKey });
    },
  });
}

/**
 * Puts a topic the server answered into the signed-in user's lists: the cached ones and the
 * ones saved on the device. It replaces the topic where it is, leaves lists it no longer
 * belongs to, and (for a create) appends it, which is the server's place for a new topic.
 * Resolves true once every changed saved list is stored; false when any could not be, or
 * when `userId` is no longer the signed-in user (then nothing is touched).
 */
export async function applyServerTopic(
  queryClient: QueryClient,
  store: TopicSnapshotStore,
  userId: string | null,
  topic: Topic,
  { created = false }: { created?: boolean } = {},
): Promise<boolean> {
  if (!userId || store.getSnapshot().userId !== userId) return false;
  const cached = new Map<string, Topic[] | undefined>(
    queryClient
      .getQueriesData<Topic[]>({ queryKey: topicsRootKey })
      .map(([key, list]) => [String(key[2]), list]),
  );
  const saved = store.getSnapshot().lists;
  const variants = new Set([...cached.keys(), ...Object.keys(saved)]);

  const saves: Promise<boolean>[] = [];
  for (const variant of variants) {
    const list = cached.get(variant) ?? saved[variant as keyof typeof saved]?.topics;
    if (!list) continue;
    const filter = filterOfVariant(variant);
    const belongs = filter.status === undefined || filter.status === topic.status;
    const known = list.some((item) => item.id === topic.id);

    let next: Topic[] | null = null;
    if (known) {
      next = belongs
        ? list.map((item) => (item.id === topic.id ? topic : item))
        : list.filter((item) => item.id !== topic.id);
    } else if (created && belongs) {
      // A new topic is the newest and unused: last in creation order and in recent order.
      next = [...list, topic];
    }
    if (!next) continue;
    if (cached.get(variant)) queryClient.setQueryData(topicsQueryKey(variant), next);
    saves.push(store.save(userId, filter, next, Date.now()));
  }
  saves.push(store.updateUnlisted(userId, topic));
  return (await Promise.all(saves)).every(Boolean);
}
