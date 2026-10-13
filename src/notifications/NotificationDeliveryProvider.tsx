import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';

import { useApi, useSession } from '../api';
import type { FocusLeaseCoordinator } from './focus-lease';
import { showOsNotificationsWhileOpen } from './os-push';
import type { PushRegistration } from './push-registration';

const PushContext = createContext<PushRegistration | null>(null);

/**
 * Push delivery for the signed-in user (M6.1): registers this device at launch when the
 * permission is already granted (never asking), keeps the focus lease with the timer, and holds
 * back notifications in the open app while focusing. Place it inside `ApiProvider`.
 */
export function NotificationDeliveryProvider({
  push,
  lease,
  children,
}: {
  push: PushRegistration;
  lease: FocusLeaseCoordinator;
  children: ReactNode;
}) {
  const { status, user } = useSession();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;

  useEffect(() => lease.start(), [lease]);
  useEffect(() => showOsNotificationsWhileOpen(() => lease.focusing()), [lease]);
  useEffect(() => {
    if (userId) void push.refresh();
  }, [push, userId]);

  return <PushContext.Provider value={push}>{children}</PushContext.Provider>;
}

export function usePushRegistration(): PushRegistration {
  const push = useContext(PushContext);
  if (!push)
    throw new Error('usePushRegistration must be used inside NotificationDeliveryProvider.');
  return push;
}

/** Signs out on this device: first this device stops receiving the account's notifications. */
export function useSignOut(): () => Promise<void> {
  const { auth } = useApi();
  const push = usePushRegistration();
  return useCallback(async () => {
    await push.unregister();
    await auth.signOut();
  }, [auth, push]);
}
