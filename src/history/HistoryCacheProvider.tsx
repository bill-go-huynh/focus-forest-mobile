import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { useSession } from '../api';
import type { HistorySnapshot, HistorySnapshotStore } from './history-snapshot-store';

const HistoryCacheContext = createContext<HistorySnapshotStore | null>(null);

/**
 * Reads the signed-in user's saved history as soon as they are known, so an offline History
 * (and a session opened from it) still shows what was last loaded. Sign-out forgets it in
 * memory; storage keeps it.
 */
export function HistoryCacheProvider({
  store,
  children,
}: {
  store: HistorySnapshotStore;
  children: ReactNode;
}) {
  const { status, user } = useSession();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;

  useEffect(() => {
    if (userId) void store.activate(userId);
    else store.deactivate();
  }, [store, userId]);

  return <HistoryCacheContext.Provider value={store}>{children}</HistoryCacheContext.Provider>;
}

export function useHistorySnapshotStore(): HistorySnapshotStore {
  const store = useContext(HistoryCacheContext);
  if (!store) throw new Error('useHistorySnapshotStore must be used inside HistoryCacheProvider.');
  return store;
}

export function useHistorySnapshot(): HistorySnapshot {
  const store = useHistorySnapshotStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
