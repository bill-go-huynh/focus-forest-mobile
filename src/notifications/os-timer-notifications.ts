import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import type { TimerNotificationTap } from './expo-timer-notifications';
import type { NotificationPermission, TimerNotificationAdapter } from './timer-notifications';

export interface NotificationEnvironment {
  expoGo: boolean;
  os: string;
}

const currentEnvironment = (): NotificationEnvironment => ({
  expoGo: isRunningInExpoGo(),
  os: Platform.OS,
});

/**
 * Whether the OS notifications can be used here. Not in Expo Go on Android: since SDK 53,
 * loading expo-notifications there throws (push was removed from Expo Go, and the module
 * registers a push-token listener as soon as it loads). A development build is needed there.
 */
export function osNotificationsSupported(
  environment: NotificationEnvironment = currentEnvironment(),
): boolean {
  return !(environment.expoGo && environment.os === 'android');
}

type ExpoTimerNotifications = typeof import('./expo-timer-notifications');

/**
 * expo-notifications, loaded only where it can be, and only when first used: a require inside
 * a function, which Metro and Jest both load lazily (a top-level import would load it at once).
 */
const loadExpo = (): ExpoTimerNotifications =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on demand, see above
  require('./expo-timer-notifications') as ExpoTimerNotifications;

const OFF: NotificationPermission = { status: 'denied', canAskAgain: false };

/** Where notifications cannot be used: never asked, never scheduled, nothing pending. */
const unsupportedAdapter: TimerNotificationAdapter = {
  permission: async () => OFF,
  requestPermission: async () => OFF,
  scheduled: async () => [],
  schedule: async () => undefined,
  cancel: async () => undefined,
};

/**
 * The timer's OS notifications (`createExpoTimerNotificationAdapter`), or none in Expo Go on
 * Android, where the timer works the same without them.
 */
export function createOsTimerNotificationAdapter(
  environment: NotificationEnvironment = currentEnvironment(),
): TimerNotificationAdapter {
  if (!osNotificationsSupported(environment)) return unsupportedAdapter;
  let expo: TimerNotificationAdapter | null = null;
  const adapter = () => (expo ??= loadExpo().createExpoTimerNotificationAdapter());
  return {
    permission: () => adapter().permission(),
    requestPermission: () => adapter().requestPermission(),
    scheduled: () => adapter().scheduled(),
    schedule: (notification) => adapter().schedule(notification),
    cancel: (identifier) => adapter().cancel(identifier),
  };
}

/**
 * Calls `listener` when the user taps a timer notification (`onTimerNotificationTap` in
 * expo-timer-notifications); none in Expo Go on Android. Returns the unsubscribe.
 */
export function onTimerNotificationTap(
  listener: (tap: TimerNotificationTap) => void,
  environment: NotificationEnvironment = currentEnvironment(),
): () => void {
  if (!osNotificationsSupported(environment)) return () => undefined;
  return loadExpo().onTimerNotificationTap(listener);
}
