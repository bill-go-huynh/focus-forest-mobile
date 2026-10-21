import { Platform } from 'react-native';

import { osNotificationsSupported, type NotificationEnvironment } from './os-timer-notifications';
import type { PushAdapter } from './push-registration';
import type { PushTap } from './expo-push';

type ExpoPush = typeof import('./expo-push');

/** expo-push, loaded on first use only (see `os-timer-notifications`). */
const loadExpo = (): ExpoPush =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on demand
  require('./expo-push') as ExpoPush;

const NONE: PushAdapter = {
  permission: async () => ({ status: 'denied', canAskAgain: false }),
  requestPermission: async () => ({ status: 'denied', canAskAgain: false }),
  token: async () => null,
};

/** Push permission and token (`createExpoPushAdapter`), or none in Expo Go on Android. */
export function createOsPushAdapter(environment?: NotificationEnvironment): PushAdapter {
  if (!osNotificationsSupported(environment)) return NONE;
  let expo: PushAdapter | null = null;
  const adapter = () => (expo ??= loadExpo().createExpoPushAdapter());
  return {
    permission: () => adapter().permission(),
    requestPermission: () => adapter().requestPermission(),
    token: () => adapter().token(),
  };
}

/** Installs how notifications show while the app is open (`showWhileOpen`), where supported. */
export function showOsNotificationsWhileOpen(
  focusing: () => boolean,
  environment?: NotificationEnvironment,
): void {
  if (!osNotificationsSupported(environment)) return;
  loadExpo().showWhileOpen(focusing);
}

/** This device's platform, as the API names it. */
export const devicePlatform = (): 'ios' | 'android' =>
  Platform.OS === 'android' ? 'android' : 'ios';

/** `onPushTap`, where supported; none in Expo Go on Android. Returns the unsubscribe. */
export function onOsPushTap(
  listener: (tap: PushTap) => void,
  environment?: NotificationEnvironment,
): () => void {
  if (!osNotificationsSupported(environment)) return () => undefined;
  return loadExpo().onPushTap(listener);
}
