import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  createExpoTimerNotificationAdapter,
  FOCUS_TIMER_CHANNELS,
  onTimerNotificationTap,
} from '../expo-timer-notifications';
import { TIMER_NOTIFICATION_COPY, type TimerNotification } from '../timer-notifications';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationHandler: jest.fn(),
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
}));

const mocked = jest.mocked(Notifications);

const notification: TimerNotification = {
  identifier: 'focus-timer.0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
  event: 'completion',
  at: Date.parse('2026-09-29T08:25:00.000Z'),
  sound: true,
  ...TIMER_NOTIFICATION_COPY.completion,
};

const request = (data: unknown, identifier = notification.identifier) =>
  ({
    identifier,
    content: { title: 'x', body: 'y', data },
    trigger: null,
  }) as never;

beforeEach(() => jest.clearAllMocks());

describe('the Expo adapter', () => {
  it('schedules one notification at the exact instant, under the session’s identifier', async () => {
    Platform.OS = 'ios';
    await createExpoTimerNotificationAdapter().schedule(notification);

    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: notification.identifier,
      content: {
        title: 'Focus complete',
        body: 'Your focus session is ready.',
        sound: true,
        data: {
          kind: 'focus-timer',
          userId: notification.userId,
          sessionId: notification.sessionId,
          event: 'completion',
          at: notification.at,
          sound: true,
        },
      },
      trigger: { type: 'date', date: notification.at, channelId: FOCUS_TIMER_CHANNELS.sound },
    });
  });

  it('asks iOS for no sound when the sound preference is off', async () => {
    Platform.OS = 'ios';
    await createExpoTimerNotificationAdapter().schedule({ ...notification, sound: false });

    const [input] = mocked.scheduleNotificationAsync.mock.calls[0]!;
    expect(input.content.sound).toBe(false);
    expect(input.content.data).toMatchObject({ sound: false });
    expect(mocked.setNotificationChannelAsync).not.toHaveBeenCalled();
  });
});

describe('Android channels', () => {
  const channelOf = (call: number) =>
    (mocked.scheduleNotificationAsync.mock.calls[call]![0].trigger as { channelId: string })
      .channelId;

  beforeEach(() => {
    Platform.OS = 'android';
  });

  it('are two stable ids: one with the default sound, one silent', () => {
    expect(FOCUS_TIMER_CHANNELS).toEqual({ sound: 'focus-timer', silent: 'focus-timer-silent' });
  });

  it('puts a notification with sound on the sound channel, set up with the default sound', async () => {
    await createExpoTimerNotificationAdapter().schedule(notification);

    expect(channelOf(0)).toBe('focus-timer');
    // No `sound` key: the channel keeps the system default sound.
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith('focus-timer', {
      name: 'Focus timer',
      importance: 3,
    });
  });

  it('puts a silent notification on the silent channel: same importance, so it still shows', async () => {
    await createExpoTimerNotificationAdapter().schedule({ ...notification, sound: false });

    expect(channelOf(0)).toBe('focus-timer-silent');
    // `sound: null` is the channel with no sound (expo-notifications, Android).
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith('focus-timer-silent', {
      name: 'Focus timer (silent)',
      importance: 3,
      sound: null,
    });
  });

  it('sets each channel up once, never per session', async () => {
    const adapter = createExpoTimerNotificationAdapter();
    for (let i = 0; i < 3; i += 1) {
      await adapter.schedule({ ...notification, sessionId: `s${i}`, identifier: `id${i}` });
      await adapter.schedule({
        ...notification,
        sessionId: `q${i}`,
        identifier: `q${i}`,
        sound: false,
      });
    }

    const ids = mocked.setNotificationChannelAsync.mock.calls.map(([id]) => id);
    expect(ids.sort()).toEqual(['focus-timer', 'focus-timer-silent']);
  });

  it('tries a channel again after its setup failed', async () => {
    mocked.setNotificationChannelAsync.mockRejectedValueOnce(new Error('no'));
    const adapter = createExpoTimerNotificationAdapter();

    await expect(adapter.schedule(notification)).rejects.toThrow('no');
    await adapter.schedule(notification);

    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledTimes(2);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
});

describe('reading back', () => {
  it('reads back only the timer’s own notifications, from what it stored in them', async () => {
    mocked.getAllScheduledNotificationsAsync.mockResolvedValue([
      request({
        kind: 'focus-timer',
        userId: notification.userId,
        sessionId: notification.sessionId,
        event: 'completion',
        at: notification.at,
        sound: true,
      }),
      request({ kind: 'something-else' }, 'other'),
      request({ kind: 'focus-timer', event: 'unknown' }, 'broken'),
    ]);

    expect(await createExpoTimerNotificationAdapter().scheduled()).toEqual([notification]);
  });

  it('maps the permission, including whether the OS may ask again', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    } as never);
    mocked.requestPermissionsAsync.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
    } as never);
    const adapter = createExpoTimerNotificationAdapter();

    expect(await adapter.permission()).toEqual({ status: 'undetermined', canAskAgain: true });
    expect(await adapter.requestPermission()).toEqual({ status: 'denied', canAskAgain: false });
  });
});

describe('in the foreground', () => {
  it('installs no notification handler, so the OS default keeps them off screen while the app is open', async () => {
    Platform.OS = 'ios';
    mocked.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    const adapter = createExpoTimerNotificationAdapter();
    await adapter.schedule(notification);
    await adapter.scheduled();
    await adapter.cancel(notification.identifier);

    expect(mocked.setNotificationHandler).not.toHaveBeenCalled();
  });
});

describe('a tap on a timer notification', () => {
  const TAP = 'expo.modules.notifications.actions.DEFAULT';
  const response = (data: unknown, actionIdentifier = TAP) =>
    ({ actionIdentifier, notification: { request: request(data) } }) as never;
  const timerData = {
    kind: 'focus-timer',
    userId: notification.userId,
    sessionId: notification.sessionId,
    event: 'pause_limit',
    at: notification.at,
    sound: true,
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('passes on only who and which session: the event is a hint, never the outcome', async () => {
    const taps = jest.fn();
    onTimerNotificationTap(taps);
    const [[listener]] = mocked.addNotificationResponseReceivedListener.mock.calls as unknown as [
      [(r: unknown) => void],
    ];

    listener(response(timerData));

    expect(taps).toHaveBeenCalledWith({
      userId: notification.userId,
      sessionId: notification.sessionId,
    });
  });

  it('ignores other notifications and other actions', async () => {
    const taps = jest.fn();
    onTimerNotificationTap(taps);
    const [[listener]] = mocked.addNotificationResponseReceivedListener.mock.calls as unknown as [
      [(r: unknown) => void],
    ];

    listener(response({ kind: 'something-else', userId: 'u', sessionId: 's' }));
    listener(response(timerData, 'dismiss'));
    listener(response({ kind: 'focus-timer', userId: 4 }));

    expect(taps).not.toHaveBeenCalled();
  });

  it('picks up the tap that launched the app, once', async () => {
    mocked.getLastNotificationResponseAsync.mockResolvedValueOnce(response(timerData));
    const taps = jest.fn();

    onTimerNotificationTap(taps);
    await flush();

    expect(taps).toHaveBeenCalledTimes(1);
    expect(mocked.clearLastNotificationResponseAsync).toHaveBeenCalled();
  });

  it('stops listening when asked', () => {
    const remove = jest.fn();
    mocked.addNotificationResponseReceivedListener.mockReturnValueOnce({ remove } as never);

    onTimerNotificationTap(jest.fn())();

    expect(remove).toHaveBeenCalled();
  });
});
