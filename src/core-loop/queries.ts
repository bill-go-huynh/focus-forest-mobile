import { useQuery } from '@tanstack/react-query';

import { getCurrentTree, getHome, useApi, useSession, type HomeResponse } from '../api';
import { serverConfirmations } from './confirmations';
import { useHomeSnapshot, useHomeSnapshotStore } from './HomeCacheProvider';
import { currentTreeQueryKey, homeQueryKey } from './query-keys';

/**
 * A Home answer, and the count of server confirmations when its request began (it holds at
 * least the sessions confirmed by then).
 */
interface HomeAnswer {
  home: HomeResponse;
  askedAfter: number;
}

/**
 * Home (GET /me/home), the one request behind the Home screen. Each answer is saved for an
 * offline launch before it shows (in `queryFn`). `home` is the server's answer, else the saved
 * one (`fromDevice`, with `savedAt`), else null. `askedAfter` is the confirmation count when the
 * live answer's request began, so a screen can tell a Home asked after a session was confirmed
 * from an older one.
 * Nothing is computed or merged on the device.
 */
export function useHome() {
  const { client } = useApi();
  const { user } = useSession();
  const userId = user?.id ?? null;
  const store = useHomeSnapshotStore();
  const saved = useHomeSnapshot();
  const query = useQuery({
    queryKey: homeQueryKey,
    queryFn: async (): Promise<HomeAnswer> => {
      const askedAfter = serverConfirmations.current();
      const startedAt = Date.now();
      const home = await getHome(client);
      if (userId) await store.save(userId, home, startedAt);
      return { home, askedAfter };
    },
    enabled: userId !== null,
  });
  const savedHome: HomeResponse | null =
    saved.userId === userId && saved.home !== null ? saved.home : null;
  return {
    query,
    home: query.data?.home ?? savedHome,
    askedAfter: query.data?.askedAfter ?? null,
    fromDevice: query.data === undefined && savedHome !== null,
    savedAt: query.data === undefined ? saved.savedAt : null,
    /** The saved Home is still being read: not yet known whether there is one. */
    restoring: saved.userId !== userId || saved.status === 'restoring',
  };
}

/** The current month's tree and stats (GET /me/trees/current), for Tree Details. */
export function useCurrentTree() {
  const { client } = useApi();
  const { user } = useSession();
  return useQuery({
    queryKey: currentTreeQueryKey,
    queryFn: () => getCurrentTree(client),
    enabled: user !== null,
  });
}
