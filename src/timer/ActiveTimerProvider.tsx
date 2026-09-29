import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useSession } from '../api';
import type { ActiveTimerSnapshot, ActiveTimerStore } from './active-timer-store';
import { ForegroundWakeup } from './foreground-wakeup';

const ActiveTimerContext = createContext<ActiveTimerStore | null>(null);

/**
 * Restores the signed-in user's timer as soon as the session knows who they are, and forgets
 * it in memory on sign-out (storage keeps it). Launch does not wait for it. Whenever the app
 * comes back to the foreground, the timer is settled: a completion or pause limit reached in
 * the background is stored at the instant it happened, wherever the app is showing. No work
 * runs in the background; the timestamps keep the time. While the app is open, a wake-up
 * refreshes it when the end arrives, on any screen (`ForegroundWakeup`).
 */
export function ActiveTimerProvider({
  store,
  onForeground,
  children,
}: {
  store: ActiveTimerStore;
  /**
   * Runs after the foreground refresh, with the timer as settled (timer notifications, and a
   * retry of what waits for the server).
   */
  onForeground?: () => void;
  children: ReactNode;
}) {
  const { status, user } = useSession();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;

  useEffect(() => {
    if (userId) void store.activate(userId);
    else store.deactivate();
  }, [store, userId]);

  useEffect(() => {
    const wakeup = new ForegroundWakeup({ timers: store });
    const stop = wakeup.start();
    const subscription = AppState.addEventListener('change', (state) => {
      wakeup.setActive(state === 'active');
      if (state === 'active') void store.refresh().then(() => onForeground?.());
    });
    return () => {
      subscription.remove();
      stop();
    };
  }, [store, onForeground]);

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
