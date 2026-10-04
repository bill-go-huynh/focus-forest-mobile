import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { useSession } from '../api';
import type { CelebrationsSnapshot, CelebrationStore } from './celebration-store';

const CelebrationsContext = createContext<CelebrationStore | null>(null);

/**
 * Reads the signed-in user's waiting celebrations as soon as they are known. Sign-out forgets
 * them in memory; storage keeps them for that user's next sign-in, never for another user.
 */
export function CelebrationsProvider({
  store,
  children,
}: {
  store: CelebrationStore;
  children: ReactNode;
}) {
  const { status, user } = useSession();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;

  useEffect(() => {
    if (userId) void store.activate(userId);
    else store.deactivate();
  }, [store, userId]);

  return <CelebrationsContext.Provider value={store}>{children}</CelebrationsContext.Provider>;
}

export function useCelebrationStore(): CelebrationStore {
  const store = useContext(CelebrationsContext);
  if (!store) throw new Error('useCelebrationStore must be used inside CelebrationsProvider.');
  return store;
}

/** The signed-in user's waiting celebrations; empty for anyone else. */
export function useCelebrations(): CelebrationsSnapshot {
  const store = useCelebrationStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { user } = useSession();
  return snapshot.userId === user?.id ? snapshot : { ...snapshot, pending: [], held: [] };
}
