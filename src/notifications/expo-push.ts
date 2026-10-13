import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { foregroundPresentation } from './foreground';
import type { PushAdapter } from './push-registration';
import type { NotificationPermission } from './timer-notifications';

/**
 * Push through expo-notifications (M6.1): the permission, this device's Expo push token, and
 * how a notification shows while the app is open. Loaded only through `os-push` (never in Expo
 * Go on Android, where loading expo-notifications throws), like `expo-timer-notifications`.
 */

function toPermission(response: { status: string; canAskAgain: boolean }): NotificationPermission {
  const status =
    response.status === 'granted' || response.status === 'denied'
      ? response.status
      : 'undetermined';
  return { status, canAskAgain: response.canAskAgain };
}

/** The EAS project id the push token belongs to; none until the app has one (decision 5). */
function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id !== '' ? id : null;
}

export function createExpoPushAdapter(): PushAdapter {
  return {
    permission: async () => toPermission(await Notifications.getPermissionsAsync()),
    requestPermission: async () => toPermission(await Notifications.requestPermissionsAsync()),
    token: async () => {
      const id = projectId();
      if (!id) return null;
      return (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    },
  };
}

/**
 * Shows notifications that arrive while the app is open, unless `focusing()` (M6.1). The
 * timer's own never show here: the Focus screen shows the end itself.
 */
export function showWhileOpen(focusing: () => boolean): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) =>
      foregroundPresentation(notification.request.content.data, focusing()),
  });
}
