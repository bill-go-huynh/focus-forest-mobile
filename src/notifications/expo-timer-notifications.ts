import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  TIMER_NOTIFICATION_COPY,
  type NotificationPermission,
  type TimerNotification,
  type TimerNotificationAdapter,
} from './timer-notifications';

/**
 * The timer's notifications through expo-notifications: the only file that uses it. The sound
 * preference is the content's `sound` on iOS and the channel on Android. No
 * notification handler is installed, so the OS default applies: nothing is shown while the app
 * is open (the Focus screen shows the end itself), and the OS shows it in the background or on
 * the lock screen.
 */

/**
 * Two stable Android channels (Android 8+ needs one; its sound is fixed once it exists, so the
 * sound preference picks a channel instead of changing one). Same importance: both show.
 */
export const FOCUS_TIMER_CHANNELS = { sound: 'focus-timer', silent: 'focus-timer-silent' } as const;

const CHANNEL_SETUP: Record<
  keyof typeof FOCUS_TIMER_CHANNELS,
  Notifications.NotificationChannelInput
> = {
  // No `sound` key: the system default notification sound.
  sound: { name: 'Focus timer', importance: Notifications.AndroidImportance.DEFAULT },
  // `sound: null` is a channel with no sound.
  silent: {
    name: 'Focus timer (silent)',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
  },
};

const KIND = 'focus-timer';

function toPermission(response: { status: string; canAskAgain: boolean }): NotificationPermission {
  const status =
    response.status === 'granted' || response.status === 'denied'
      ? response.status
      : 'undetermined';
  return { status, canAskAgain: response.canAskAgain };
}

/** A pending request back as the timer scheduled it, from the data it carries; else null. */
function fromRequest(request: Notifications.NotificationRequest): TimerNotification | null {
  const data = request.content.data as Record<string, unknown> | null | undefined;
  if (!data || data.kind !== KIND) return null;
  const { userId, sessionId, event, at, sound } = data;
  if (
    typeof userId !== 'string' ||
    typeof sessionId !== 'string' ||
    (event !== 'completion' && event !== 'pause_limit') ||
    typeof at !== 'number' ||
    typeof sound !== 'boolean'
  ) {
    return null;
  }
  return {
    identifier: request.identifier,
    userId,
    sessionId,
    event,
    at,
    sound,
    ...TIMER_NOTIFICATION_COPY[event],
  };
}

export function createExpoTimerNotificationAdapter(): TimerNotificationAdapter {
  const channels: Partial<Record<keyof typeof FOCUS_TIMER_CHANNELS, Promise<unknown>>> = {};
  /** Sets the channel up once per launch (idempotent on the OS too); again after a failure. */
  const ensureChannel = (kind: keyof typeof FOCUS_TIMER_CHANNELS) => {
    if (Platform.OS !== 'android') return Promise.resolve();
    channels[kind] ??= Notifications.setNotificationChannelAsync(
      FOCUS_TIMER_CHANNELS[kind],
      CHANNEL_SETUP[kind],
    ).catch((error: unknown) => {
      delete channels[kind];
      throw error;
    });
    return channels[kind];
  };

  return {
    permission: async () => toPermission(await Notifications.getPermissionsAsync()),
    requestPermission: async () => toPermission(await Notifications.requestPermissionsAsync()),
    scheduled: async () =>
      (await Notifications.getAllScheduledNotificationsAsync())
        .map(fromRequest)
        .filter((item): item is TimerNotification => item !== null),
    schedule: async (notification) => {
      const { identifier, userId, sessionId, event, at, sound, title, body } = notification;
      const channel = sound ? 'sound' : 'silent';
      await ensureChannel(channel);
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: { title, body, sound, data: { kind: KIND, userId, sessionId, event, at, sound } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: at,
          channelId: FOCUS_TIMER_CHANNELS[channel],
        },
      });
    },
    cancel: (identifier) => Notifications.cancelScheduledNotificationAsync(identifier),
  };
}
