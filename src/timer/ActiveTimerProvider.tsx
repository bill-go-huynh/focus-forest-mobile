import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useSession } from '../api';
import type { ActiveTimerSnapshot, ActiveTimerStore } from './active-timer-store';

const ActiveTimerContext = createContext<ActiveTimerStore | null>(null);

/**
 * Restores the signed-in user's timer as soon as the session knows who they are, and forgets
 * it in memory on sign-out (storage keeps it). Launch does not wait for it. Whenever the app
 * comes back to the foreground, the timer is settled: a completion or pause limit reached in
 * the background is stored at the instant it happened, wherever the app is showing. No work
 * runs in the background; the timestamps keep the time.
 */
export function ActiveTimerProvider({
  store,
  children,
}: {
  store: ActiveTimerStore;
  children: ReactNode;
}) {
  const { status, user } = useSession();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;

  useEffect(() => {
    if (userId) void store.activate(userId);
    else store.deactivate();
  }, [store, userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void store.refresh();
    });
    return () => subscription.remove();
  }, [store]);

  return <ActiveTimerContext.Provider value={store}>{children}</ActiveTimerContext.Provider>;
}

export function useActiveTimerStore(): ActiveTimerStore {
  const store = useContext(ActiveTimerContext);
  if (!store) throw new Error('useActiveTimerStore must be used inside ActiveTimerProvider.');
  return store;
}

/** The active timer's status and state, updated on every stored transition. */
export function useActiveTimer(): ActiveTimerSnapshot {
  const store = useActiveTimerStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
