import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getSessionHistory, useApi, useSession, type SessionHistoryItem } from '../api';
import { useHistorySnapshot, useHistorySnapshotStore } from './HistoryCacheProvider';
import { mergeHistoryPages } from './history-format';
import { historyQueryKey } from './query-keys';

function useHistoryQuery({ enabled }: { enabled: boolean }) {
  const { client } = useApi();
  const { user } = useSession();
  const userId = user?.id ?? null;
  const store = useHistorySnapshotStore();
  return useInfiniteQuery({
    queryKey: historyQueryKey,
    queryFn: async ({ pageParam }) => {
      const page = await getSessionHistory(client, { cursor: pageParam });
      // Saved for an offline launch before it shows: a first page replaces what was saved (a
      // refetch starts there), a next page is added to it in order.
      if (userId) {
        const before = pageParam === null ? [] : store.getSnapshot().items;
        await store.save(userId, mergeHistoryPages([{ items: before }, page]), Date.now());
      }
      return page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled,
  });
}

/**
 * The focus history, paged by the server's cursor (GET /me/sessions): the first page on use,
 * the next only when asked. Every page is saved (in `queryFn`) for an offline launch. `items` is the loaded
 * pages (each session once), else the saved history (`fromDevice`, never paged), else null.
 */
export function useSessionHistory() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const saved = useHistorySnapshot();
  const query = useHistoryQuery({ enabled: userId !== null });

  const fromServer = useMemo(
    () => (query.data ? mergeHistoryPages(query.data.pages) : null),
    [query.data],
  );

  const savedItems = saved.userId === userId && saved.savedAt !== null ? saved.items : null;
  return {
    query,
    items: fromServer ?? savedItems,
    fromDevice: fromServer === null && savedItems !== null,
  };
}

/**
 * A session the device has from history: a loaded page, else the saved history. Never
 * fetches: opening a session from History needs nothing more than the row it came from.
 */
export function useHistoryItem(sessionId: string): SessionHistoryItem | null {
  const { user } = useSession();
  const saved = useHistorySnapshot();
  const query = useHistoryQuery({ enabled: false });
  const loaded = query.data?.pages
    .flatMap((page) => page.items)
    .find((item) => item.id === sessionId);
  if (loaded) return loaded;
  if (saved.userId !== user?.id) return null;
  return saved.items.find((item) => item.id === sessionId) ?? null;
}
