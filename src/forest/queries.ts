import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import {
  getForest,
  getRecap,
  getTreeDetails,
  markCeremonySeen,
  markRecapSeen,
  useApi,
  useSession,
  type MonthRef,
} from '../api';
import { useCelebrationStore } from '../celebrations/CelebrationsProvider';
import { homeQueryKey } from '../core-loop/query-keys';
import { mergeForestPages } from './forest-format';

/** The signed-in user's forest and archived months; dropped with the cache on sign-out. */
export const forestQueryKey = ['me', 'forest'] as const;
export const treeDetailsQueryKey = ({ year, month }: MonthRef) =>
  ['me', 'trees', year, month] as const;
export const recapQueryKey = ({ year, month }: MonthRef) =>
  ['me', 'trees', year, month, 'recap'] as const;

/**
 * The forest timeline (GET /me/forest), paged by the server's opaque cursor: the first page on
 * use, earlier months only when asked. `items` is every loaded month once, in the server's order
 * (newest first); a failed page keeps the loaded ones. Nothing is filled in on the device.
 */
export function useForest() {
  const { client } = useApi();
  const { user } = useSession();
  const query = useInfiniteQuery({
    queryKey: forestQueryKey,
    queryFn: ({ pageParam }) => getForest(client, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: user !== null,
  });
  const items = useMemo(
    () => (query.data ? mergeForestPages(query.data.pages) : null),
    [query.data],
  );
  const first = query.data?.pages[0] ?? null;
  return { query, items, summary: first?.summary ?? null, progression: first?.progression ?? null };
}

/** One month's Tree Details (archived, growing, or resting), as stored. */
export function useTreeDetails(month: MonthRef) {
  const { client } = useApi();
  const { user } = useSession();
  return useQuery({
    queryKey: treeDetailsQueryKey(month),
    queryFn: () => getTreeDetails(client, month),
    enabled: user !== null,
  });
}

/** The archived month's recap, the snapshot stored at archive: never recomputed here. */
export function useRecap(month: MonthRef) {
  const { client } = useApi();
  const { user } = useSession();
  return useQuery({
    queryKey: recapQueryKey(month),
    queryFn: () => getRecap(client, month),
    enabled: user !== null,
  });
}

/** Marks the recap viewed (idempotent on the server); separate from the ceremony. */
export function useMarkRecapSeen() {
  const { client } = useApi();
  return useMutation({ mutationFn: (month: MonthRef) => markRecapSeen(client, month) });
}

/**
 * Acknowledges a month-end ceremony the user accepted (finished or skipped). It is stored as
 * shown first (the celebration store), so it never plays again here, then PUT …/ceremony-seen
 * (idempotent); once the server confirms, nothing is left to send. A failed mark is sent again
 * later (`retry`); the server's `ceremonySeenAt` stays the truth.
 */
export function useCeremonyAcknowledgement() {
  const { client } = useApi();
  const { user } = useSession();
  const store = useCelebrationStore();
  const queryClient = useQueryClient();

  const send = useCallback(
    async (userId: string, month: MonthRef) => {
      try {
        await markCeremonySeen(client, month);
      } catch {
        return false;
      }
      await store.ceremonyAcknowledged(userId, month);
      void queryClient.invalidateQueries({ queryKey: homeQueryKey }).catch(() => undefined);
      return true;
    },
    [client, store, queryClient],
  );

  const acknowledge = useCallback(
    async (month: MonthRef) => {
      if (!user) return false;
      await store.ceremonyShown(user.id, month);
      return send(user.id, month);
    },
    [user, store, send],
  );

  const retry = useCallback(
    (month: MonthRef) => (user ? send(user.id, month) : Promise.resolve(false)),
    [user, send],
  );

  return { acknowledge, retry };
}
