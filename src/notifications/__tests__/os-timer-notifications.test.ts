import {
  resetNotificationsMock,
  scheduledNotifications,
} from '../../test-utils/notifications-mock';
import type { TimerNotification } from '../timer-notifications';

/**
 * Expo Go on Android throws as soon as expo-notifications is loaded (SDK 53+: push was removed
 * from Expo Go, and the module registers a push-token listener on import). The app must still
 * load there, with the timer's notifications off; everywhere else they work as before.
 */

const EXPO_GO_ANDROID = { expoGo: true, os: 'android' } as const;
const EXPO_GO_IOS = { expoGo: true, os: 'ios' } as const;
const DEV_BUILD_ANDROID = { expoGo: false, os: 'android' } as const;

const notification: TimerNotification = {
  identifier: 'focus-timer.0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
  userId: 'user-1',
  sessionId: '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
  event: 'completion',
  at: Date.parse('2026-09-30T10:25:00.000Z'),
  sound: true,
  title: 'Focus session complete',
  body: 'Nice work.',
};

/** Loads modules in isolation with expo-notifications throwing on load, as in Expo Go Android. */
function withThrowingNotifications<T>(load: () => T): T {
  let loaded: T | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo-notifications', () => {
      throw new Error('expo-notifications cannot be loaded in Expo Go on Android.');
    });
    loaded = load();
  });
  // Back to the in-memory OS every other test uses (jest-setup).
  jest.doMock(
    'expo-notifications',
    () => jest.requireActual('../../test-utils/notifications-mock').notificationsMock,
  );
  return loaded as T;
}

beforeEach(() => resetNotificationsMock());

describe('where the OS notifications can be used', () => {
  it('is everywhere but Expo Go on Android', () => {
    const { osNotificationsSupported } = jest.requireActual<
      typeof import('../os-timer-notifications')
    >('../os-timer-notifications');
    expect(osNotificationsSupported(EXPO_GO_ANDROID)).toBe(false);
    expect(osNotificationsSupported(EXPO_GO_IOS)).toBe(true);
    expect(osNotificationsSupported(DEV_BUILD_ANDROID)).toBe(true);
  });
});

describe('in Expo Go on Android', () => {
  it('loads the whole app without ever loading expo-notifications', () => {
    expect(() =>
      withThrowingNotifications(() => {
        jest.requireActual('../index');
        return jest.requireActual('../../app/_layout');
      }),
    ).not.toThrow();
  });

  it('never asks, never schedules, and reads nothing pending', async () => {
    const { adapter, stopTaps, taps } = withThrowingNotifications(() => {
      const os = jest.requireActual<typeof import('../os-timer-notifications')>(
        '../os-timer-notifications',
      );
      const seen: unknown[] = [];
      return {
        adapter: os.createOsTimerNotificationAdapter(EXPO_GO_ANDROID),
        stopTaps: os.onTimerNotificationTap((tap) => seen.push(tap), EXPO_GO_ANDROID),
        taps: seen,
      };
    });

    // Denied and not askable: the coordinator asks nothing and schedules nothing.
    expect(await adapter.permission()).toEqual({ status: 'denied', canAskAgain: false });
    expect(await adapter.requestPermission()).toEqual({ status: 'denied', canAskAgain: false });
    await adapter.schedule(notification);
    await adapter.cancel(notification.identifier);
    expect(await adapter.scheduled()).toEqual([]);
    expect(taps).toEqual([]);
    expect(() => stopTaps()).not.toThrow();
  });
});

describe('in a development build or Expo Go on iOS', () => {
  it('schedules through expo-notifications, as before', async () => {
    const os = jest.requireActual<typeof import('../os-timer-notifications')>(
      '../os-timer-notifications',
    );
    const adapter = os.createOsTimerNotificationAdapter(DEV_BUILD_ANDROID);

    await adapter.schedule(notification);

    expect(scheduledNotifications()).toEqual([
      expect.objectContaining({ identifier: notification.identifier }),
    ]);
    expect(await adapter.scheduled()).toEqual([
      expect.objectContaining({
        identifier: notification.identifier,
        sessionId: notification.sessionId,
      }),
    ]);
  });
});
