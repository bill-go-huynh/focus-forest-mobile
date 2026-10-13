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

/** The link a tap on a push carries (A6.1 `data.link`); null for the timer's own or no link. */
function linkOf(response: Notifications.NotificationResponse): string | null {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const data = response.notification.request.content.data as Record<string, unknown> | null;
  if (!data || data.kind === 'focus-timer') return null;
  return typeof data.link === 'string' ? data.link : null;
}

/**
 * Calls `listener` with the link of each tapped push: while the app runs, and once for the tap
 * that launched it (read, then cleared). The timer's own taps are left to the timer (M2.12).
 * Returns the unsubscribe.
 */
export function onPushTap(listener: (link: string) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const link = linkOf(response);
    if (link !== null) listener(link);
  });
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      const link = response ? linkOf(response) : null;
      if (link === null) return;
      listener(link);
      return Notifications.clearLastNotificationResponseAsync();
    })
    .catch(() => undefined);
  return () => subscription.remove();
}
