import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { useSession } from '../api';
import type { HomeSnapshot, HomeSnapshotStore } from './home-snapshot-store';

const HomeCacheContext = createContext<HomeSnapshotStore | null>(null);

/**
 * Reads the signed-in user's saved Home as soon as they are known, so an offline Home (and the
 * current tree) still shows what the server last said. Sign-out forgets it in memory.
 */
export function HomeCacheProvider({
  store,
  children,
}: {
  store: HomeSnapshotStore;
  children: ReactNode;
}) {
  const { status, user } = useSession();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;

  useEffect(() => {
    if (userId) void store.activate(userId);
    else store.deactivate();
  }, [store, userId]);

  return <HomeCacheContext.Provider value={store}>{children}</HomeCacheContext.Provider>;
}

export function useHomeSnapshotStore(): HomeSnapshotStore {
  const store = useContext(HomeCacheContext);
  if (!store) throw new Error('useHomeSnapshotStore must be used inside HomeCacheProvider.');
  return store;
}

export function useHomeSnapshot(): HomeSnapshot {
  const store = useHomeSnapshotStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
