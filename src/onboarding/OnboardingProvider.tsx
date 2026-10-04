import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { useSession } from '../api';
import type { OnboardingSnapshot, OnboardingStore } from './onboarding-store';

const OnboardingContext = createContext<OnboardingStore | null>(null);

/** Reads the signed-in user's onboarding state as soon as they are known; sign-out forgets it. */
export function OnboardingProvider({
  store,
  children,
}: {
  store: OnboardingStore;
  children: ReactNode;
}) {
  const { status, user } = useSession();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;

  useEffect(() => {
    if (userId) void store.activate(userId);
    else store.deactivate();
  }, [store, userId]);

  return <OnboardingContext.Provider value={store}>{children}</OnboardingContext.Provider>;
}

export function useOnboardingStore(): OnboardingStore {
  const store = useContext(OnboardingContext);
  if (!store) throw new Error('useOnboardingStore must be used inside OnboardingProvider.');
  return store;
}

/** The signed-in user's onboarding; nothing for anyone else. */
export function useOnboarding(): OnboardingSnapshot {
  const store = useOnboardingStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { user } = useSession();
  return snapshot.userId === user?.id ? snapshot : { ...snapshot, onboarding: null };
}
