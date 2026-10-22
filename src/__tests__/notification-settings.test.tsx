import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo, Linking } from 'react-native';

import type { Preferences } from '../api/preferences';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { WELCOME_TITLE } from '../test-utils/welcome';
// This device had an account signed in, so a signed-out app opens on sign in (W.1).
// Signed out, the welcome opens again (owner, 2026-10-22).
const SIGNED_OUT_HEADER = WELCOME_TITLE;

/**
 * M6.1 Notification settings and delivery (spec §18, docs/02: reminders are invitations, the
 * permission is asked in context, never at launch; docs/11: reminder times are user-set).
 */

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
// An EAS project id, so the device has a push token to register (owner decision 5).
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0', extra: { eas: { projectId: 'project-1' } } } },
}));

const API = 'https://api.example.com';
const PREFERENCES_URL = `${API}/me/preferences`;
const DEVICE_URL = `${API}/me/devices/${encodeURIComponent('ExponentPushToken[test-device]')}`;
const PROFILE = {
  id: 'user-1',
  username: null,
  displayName: 'Mai',
  avatarUrl: null,
  bio: null,
  joinDate: '2026-09-26T10:00:00.000Z',
  timezone: 'Europe/Zurich',
};

type Reply = { status: number; body?: unknown } | Error;
let requests: FakeRequest[];
let stored: Preferences;
let offline = false;

/** A5 and A6.1 as implemented. */
function api(request: FakeRequest): Reply {
  if (offline) return new TypeError('offline');
  if (request.url === `${API}/me/profile`) return { status: 200, body: PROFILE };
  if (request.url === DEVICE_URL) {
    return request.method === 'PUT'
      ? {
          status: 200,
          body: { token: 'ExponentPushToken[test-device]', platform: 'ios', registeredAt: 'x' },
        }
      : { status: 204 };
  }
  if (request.url !== PREFERENCES_URL) return { status: 404, body: nestError(404, 'Not Found') };
  if (request.method === 'PATCH') {
    const { notifications, ...display } = request.body as Partial<Preferences>;
    const merged = { ...stored.notifications } as Record<string, object>;
    for (const [key, change] of Object.entries(notifications ?? {})) {
      merged[key] = { ...merged[key], ...change };
    }
    stored = { ...stored, ...display, notifications: merged as Preferences['notifications'] };
  }
  return { status: 200, body: stored };
}

const os = () =>
  jest.requireMock('expo-notifications') as {
    requestPermissionsAsync: jest.Mock;
    getPermissionsAsync: jest.Mock;
    getExpoPushTokenAsync: jest.Mock;
    setNotificationHandler: jest.Mock;
  };

const originalFetch = globalThis.fetch;
beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  stored = makePreferences();
  offline = false;
  const net = fakeFetch(api);
  requests = net.requests;
  globalThis.fetch = net.fetch;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const settle = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const patches = () => requests.filter((r) => r.method === 'PATCH').map((r) => r.body);
const devices = () => requests.filter((r) => r.url === DEVICE_URL);

async function openSettings() {
  renderApp(appRoutes, { initialUrl: '/profile/settings' });
  await screen.findByRole('switch', { name: 'Sound' });
  await settle();
}

describe('notification settings (M6.1)', () => {
  it('offers all eight categories, each saying what it sends', async () => {
    await openSettings();
    expect(screen.getByRole('header', { name: 'Notifications' })).toBeOnTheScreen();
    const hints = Object.fromEntries(
      [
        'Daily goal reminder',
        'Scheduled focus reminder',
        'Streak reminder',
        'Friend invites',
        'Focus room invites',
        'Challenge updates',
        'Badge unlocked',
        'Monthly recap ready',
      ].map((name) => [name, screen.getByRole('switch', { name }).props.accessibilityHint]),
    );
    expect(hints).toEqual({
      'Daily goal reminder': 'At a time you choose, if today’s goal is still open.',
      'Scheduled focus reminder': 'At a time you choose, to start your planned focus.',
      'Streak reminder': 'At a time you choose, on days without focus yet.',
      'Friend invites': 'When a friend invites you to a challenge.',
      'Focus room invites': 'When a friend invites you to a focus room.',
      'Challenge updates': 'When a friend joins your challenge, or it is complete.',
      'Badge unlocked': 'When you earn a new badge.',
      'Monthly recap ready': 'When last month’s recap is ready.',
    });
  });

  it('never asks for permission when Settings opens, nor at launch', async () => {
    await openSettings();
    expect(os().requestPermissionsAsync).not.toHaveBeenCalled();
    expect(devices()).toEqual([]);
  });

  it('asks the first time a category is turned on, then registers this device', async () => {
    await openSettings();
    fireEvent.press(screen.getByRole('switch', { name: 'Badge unlocked' }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(os().requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(patches()[0]).toEqual({ notifications: { badgeUnlocked: { enabled: true } } });
    await waitFor(() => expect(devices()).toHaveLength(1));
    expect(devices()[0]).toMatchObject({
      method: 'PUT',
      body: { platform: 'ios', appVersion: '0.1.0' },
      headers: { Authorization: 'Bearer test-access' },
    });
    expect(os().getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-1' });

    // A second category asks nothing more.
    fireEvent.press(screen.getByRole('switch', { name: 'Friend invites' }));
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(os().requestPermissionsAsync).toHaveBeenCalledTimes(1);

    // Turning one off never asks.
    fireEvent.press(screen.getByRole('switch', { name: 'Friend invites' }));
    await waitFor(() => expect(patches()).toHaveLength(3));
    expect(patches()[2]).toEqual({ notifications: { friendInvite: { enabled: false } } });
    expect(os().requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('never asks when a category is turned off', async () => {
    stored = makePreferences();
    stored.notifications.friendInvite = { enabled: true };
    await openSettings();
    fireEvent.press(screen.getByRole('switch', { name: 'Friend invites' }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toEqual({ notifications: { friendInvite: { enabled: false } } });
    await settle();
    expect(os().requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('keeps the choice when the system says no, and shows where to allow it', async () => {
    os().requestPermissionsAsync.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
      granted: false,
    });
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await openSettings();
    fireEvent.press(screen.getByRole('switch', { name: 'Monthly recap ready' }));

    const status = await screen.findByText(
      'Notifications are off for Focus Forest in your phone’s settings, so none can arrive yet.',
    );
    expect(status).toBeOnTheScreen();
    expect(patches()).toEqual([{ notifications: { monthlyRecapReady: { enabled: true } } }]);
    expect(devices()).toEqual([]);
    fireEvent.press(screen.getByRole('button', { name: 'Open phone settings' }));
    expect(openSettingsSpy).toHaveBeenCalled();
  });

  it('says so on opening when the phone blocks notifications that are on', async () => {
    os().getPermissionsAsync.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
      granted: false,
    });
    stored = makePreferences();
    stored.notifications.friendInvite = { enabled: true };
    await openSettings();
    expect(
      await screen.findByText(
        'Notifications are off for Focus Forest in your phone’s settings, so none can arrive yet.',
      ),
    ).toBeOnTheScreen();
    expect(os().requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('turns a reminder on at a suggested time, which can be moved by quarter hours', async () => {
    await openSettings();
    fireEvent.press(screen.getByRole('switch', { name: 'Daily goal reminder' }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    // Without a time nothing would ever be sent: it starts at a suggestion.
    expect(patches()[0]).toEqual({
      notifications: { dailyGoalReminder: { enabled: true, time: '19:00' } },
    });

    const time = await screen.findByText('Reminder at 19:00');
    expect(time).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Daily goal reminder 15 minutes later' }));
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]).toEqual({ notifications: { dailyGoalReminder: { time: '19:15' } } });
    expect(await screen.findByText('Reminder at 19:15')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Daily goal reminder 15 minutes earlier' }));
    fireEvent.press(screen.getByRole('button', { name: 'Daily goal reminder 15 minutes earlier' }));
    await waitFor(() => expect(patches()).toHaveLength(4));
    expect(patches()[3]).toEqual({ notifications: { dailyGoalReminder: { time: '18:45' } } });
  });

  it('keeps a time already chosen, and wraps around midnight', async () => {
    stored = makePreferences();
    stored.notifications.streakReminder = { enabled: false, time: '23:45' };
    await openSettings();
    // A reminder that is off shows no time.
    expect(screen.queryByText('Reminder at 23:45')).toBeNull();
    fireEvent.press(screen.getByRole('switch', { name: 'Streak reminder' }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toEqual({ notifications: { streakReminder: { enabled: true } } });
    fireEvent.press(
      await screen.findByRole('button', { name: 'Streak reminder 15 minutes later' }),
    );
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]).toEqual({ notifications: { streakReminder: { time: '00:00' } } });
  });
});

describe('the device (M6.1)', () => {
  it('registers again at launch when already allowed, without asking', async () => {
    os().getPermissionsAsync.mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
      granted: true,
    });
    await openSettings();
    await waitFor(() => expect(devices()).toHaveLength(1));
    expect(devices()[0]!.method).toBe('PUT');
    expect(os().requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('unregisters this device on sign-out, while still signed in', async () => {
    os().getPermissionsAsync.mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
      granted: true,
    });
    await openSettings();
    await waitFor(() => expect(devices()).toHaveLength(1));
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('header', { name: SIGNED_OUT_HEADER })).toBeOnTheScreen();
    expect(devices()[1]).toMatchObject({
      method: 'DELETE',
      headers: { Authorization: 'Bearer test-access' },
    });
  });

  it('signs out even when the server cannot be reached', async () => {
    os().getPermissionsAsync.mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
      granted: true,
    });
    await openSettings();
    await waitFor(() => expect(devices()).toHaveLength(1));
    offline = true;
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('header', { name: SIGNED_OUT_HEADER })).toBeOnTheScreen();
  });
});

describe('while the app is open (M6.1)', () => {
  it('shows a notification unless someone is focusing; the timer’s own never', async () => {
    await openSettings();
    const handler = os().setNotificationHandler.mock.calls.at(-1)![0] as {
      handleNotification: (n: unknown) => Promise<{ shouldShowBanner: boolean }>;
    };
    const arrive = (data: unknown) =>
      handler.handleNotification({ request: { content: { data } } });
    await expect(arrive({ link: '/' })).resolves.toMatchObject({
      shouldShowBanner: true,
      shouldShowList: true,
    });
    await expect(arrive({ kind: 'focus-timer' })).resolves.toMatchObject({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
    });
  });
});
