import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { useSession } from '../api';
import { topicsQueryKey } from './query-keys';
import type { SavedTopicLists, TopicSnapshot, TopicSnapshotStore } from './topic-snapshot-store';

const TopicCacheContext = createContext<TopicSnapshotStore | null>(null);

/**
 * Loads the signed-in user's saved topic lists into the query cache as soon as the session
 * knows who they are, with the time the server confirmed them, so an offline launch still
 * shows the known topics. Sign-out forgets them in memory; storage keeps them.
 */
export function TopicCacheProvider({
  store,
  children,
}: {
  store: TopicSnapshotStore;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const { status, user } = useSession();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;

  useEffect(() => {
    if (userId) void store.activate(userId, (lists) => seed(queryClient, lists));
    else store.deactivate();
  }, [store, queryClient, userId]);

  return <TopicCacheContext.Provider value={store}>{children}</TopicCacheContext.Provider>;
}

/** Fills only lists the cache does not have yet: a server answer always wins. */
function seed(queryClient: QueryClient, lists: SavedTopicLists): void {
  for (const [variant, list] of Object.entries(lists)) {
    const key = topicsQueryKey(variant);
    if (list && queryClient.getQueryData(key) === undefined) {
      queryClient.setQueryData(key, list.topics, { updatedAt: list.savedAt });
    }
  }
}

export function useTopicSnapshotStore(): TopicSnapshotStore {
  const store = useContext(TopicCacheContext);
  if (!store) throw new Error('useTopicSnapshotStore must be used inside TopicCacheProvider.');
  return store;
}

export function useTopicSnapshot(): TopicSnapshot {
  const store = useTopicSnapshotStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
