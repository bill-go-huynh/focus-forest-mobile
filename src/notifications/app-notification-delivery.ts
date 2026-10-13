import Constants from 'expo-constants';

import { clearFocusLease, registerDevice, setFocusLease, unregisterDevice } from '../api';
import type { ApiClient } from '../api';
import type { ActiveTimerStore } from '../timer/active-timer-store';
import { deviceClock } from '../timer/app-timer-store';
import { FocusLeaseCoordinator } from './focus-lease';
import { createOsPushAdapter, devicePlatform } from './os-push';
import { PushRegistration } from './push-registration';

const warn = (what: string) => (issue: { code: string }) =>
  console.warn(`[notifications] ${what}: ${issue.code}`);

/**
 * The app's push delivery (M6.1): this device's registration and the focus lease, over the
 * API client. Issues are reported by code only.
 */
export function createAppNotificationDelivery(client: ApiClient, timers: ActiveTimerStore) {
  const push = new PushRegistration({
    adapter: createOsPushAdapter(),
    api: {
      register: (token, device) => registerDevice(client, token, device),
      unregister: (token) => unregisterDevice(client, token),
    },
    platform: devicePlatform(),
    appVersion: Constants.expoConfig?.version ?? null,
    report: warn('device'),
  });
  const lease = new FocusLeaseCoordinator({
    timers,
    api: { set: (endsAt) => setFocusLease(client, endsAt), clear: () => clearFocusLease(client) },
    now: () => deviceClock.now(),
    report: warn('focus lease'),
  });
  return { push, lease };
}

export type NotificationDelivery = ReturnType<typeof createAppNotificationDelivery>;
