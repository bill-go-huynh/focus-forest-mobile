import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { router as expoRouter } from 'expo-router';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';

import { useReducedMotion } from '../accessibility';
import type { Preferences } from '../api/preferences';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { darkTheme, lightTheme } from '../theme';

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

const API = 'https://api.example.com';
const PREFERENCES_URL = `${API}/me/preferences`;
const PROFILE = {
  id: 'user-1',
  displayName: 'Mai',
  avatarUrl: null,
  bio: null,
  joinDate: '2026-09-26T10:00:00.000Z',
  timezone: 'Europe/Zurich',
};

type Reply = { status: number; body?: unknown } | Error;
let requests: FakeRequest[];
let stored: Preferences;

/** A5 as implemented: PATCH applies only the fields sent and returns the whole set. */
function a5(request: FakeRequest): Reply {
  if (request.url === `${API}/me/profile`) return { status: 200, body: PROFILE };
  if (request.url !== PREFERENCES_URL) return { status: 404, body: nestError(404, 'Not Found') };
  if (request.method === 'PATCH') {
    const { notifications, ...display } = request.body as Partial<Preferences>;
    stored = {
      ...stored,
      ...display,
      notifications: {
        ...stored.notifications,
        ...(notifications ?? {}),
      } as Preferences['notifications'],
    };
  }
  return { status: 200, body: stored };
}

function serve(handler: (request: FakeRequest) => Reply | Promise<Reply>) {
  const net = fakeFetch(handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
}

/** A screen that shows the app-wide reduced-motion value, in place of Insights. */
function MotionProbe() {
  return <Text>{useReducedMotion() ? 'motion reduced' : 'motion full'}</Text>;
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  stored = makePreferences();
  serve(a5);
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
const patches = () => requests.filter((r) => r.method === 'PATCH');
const background = async () =>
  StyleSheet.flatten((await screen.findByTestId('screen')).props.style).backgroundColor;

async function openSettings(routes = appRoutes) {
  const router = renderApp(routes, { initialUrl: '/profile/settings' });
  await screen.findByRole('switch', { name: 'Sound' });
  return router;
}

describe('Settings (A5: GET /me/preferences)', () => {
  it('shows the saved preferences, with the A5 defaults', async () => {
    await openSettings();
    expect(screen.getByRole('button', { name: 'System' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Light' })).not.toBeSelected();
    expect(screen.getByRole('switch', { name: 'Sound' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Haptics' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Reduce motion' })).not.toBeChecked();
    expect(requests.find((r) => r.url === PREFERENCES_URL)).toMatchObject({
      method: 'GET',
      headers: { Authorization: 'Bearer test-access' },
    });
  });

  it('shows skeletons while loading, then the settings', async () => {
    // The launch read fails (the app opens with defaults); the Settings read then waits.
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    serve(async (request) => {
      if (request.url === PREFERENCES_URL) {
        calls += 1;
        if (calls === 1) return new TypeError('offline');
        await gate;
      }
      return a5(request);
    });
    renderApp(appRoutes, { initialUrl: '/profile/settings' });

    expect(await screen.findByLabelText('Loading your settings')).toBeOnTheScreen();
    expect(screen.queryByRole('switch', { name: 'Sound' })).toBeNull();
    await act(async () => release());
    expect(await screen.findByRole('switch', { name: 'Sound' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Loading your settings')).toBeNull();
  });

  it('shows a calm error with a retry when the preferences cannot load', async () => {
    let failing = true;
    serve((request) =>
      request.url === PREFERENCES_URL && failing
        ? new TypeError('Network request failed')
        : a5(request),
    );
    renderApp(appRoutes, { initialUrl: '/profile/settings' });
    expect(
      await screen.findByText("We couldn't load your settings right now.", {}, { timeout: 15_000 }),
    ).toBeOnTheScreen();
    failing = false;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('switch', { name: 'Sound' })).toBeOnTheScreen();
  }, 20_000);

  it('shows the app version', async () => {
    await openSettings();
    expect(screen.getByLabelText('Version, 0.1.0')).toBeOnTheScreen();
  });
});

describe('theme (applies to the whole app at once)', () => {
  it('switches the app to dark before the server answers, and saves only the theme', async () => {
    let release!: () => void;
    serve(async (request) => {
      if (request.method === 'PATCH') {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return a5(request);
    });
    await openSettings();
    expect(await background()).toBe(lightTheme.colors.background.primary);

    fireEvent.press(screen.getByRole('button', { name: 'Dark' }));

    await waitFor(async () => expect(await background()).toBe(darkTheme.colors.background.primary));
    expect(screen.getByRole('button', { name: 'Dark' })).toBeSelected();
    expect(patches()[0]!.body).toEqual({ theme: 'dark' });
    await act(async () => release());
  });

  it('keeps the new theme on every screen', async () => {
    await openSettings();
    fireEvent.press(screen.getByRole('button', { name: 'Dark' }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    await act(async () => expoRouter.navigate('/forest'));
    await waitFor(async () => expect(await background()).toBe(darkTheme.colors.background.primary));
  });

  it('goes back to the previous theme and says so when saving fails', async () => {
    serve((request) => (request.method === 'PATCH' ? new TypeError('offline') : a5(request)));
    await openSettings();
    fireEvent.press(screen.getByRole('button', { name: 'Dark' }));

    expect(
      await screen.findByText("We couldn't save that change. Check your connection and try again."),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'System' })).toBeSelected();
    expect(await background()).toBe(lightTheme.colors.background.primary);
  });

  it('opens in the saved theme, without flashing the system theme first', async () => {
    stored = makePreferences({ theme: 'dark' });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    serve(async (request) => {
      if (request.url === PREFERENCES_URL) await gate;
      return a5(request);
    });
    renderApp(appRoutes, { initialUrl: '/' });

    // The session is known and the saved theme is being read: only the launch screen shows.
    await waitFor(() => expect(requests.some((r) => r.url === PREFERENCES_URL)).toBe(true));
    await settle();
    expect(screen.getByTestId('launch-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
    expect(screen.queryByRole('header', { name: 'This month' })).toBeNull();

    await act(async () => release());
    await screen.findByTestId('tab-bar');
    expect(await background()).toBe(darkTheme.colors.background.primary);
  });

  it('still opens, with the defaults, when the preferences cannot be read at launch', async () => {
    serve((request) => (request.url === PREFERENCES_URL ? new TypeError('offline') : a5(request)));
    renderApp(appRoutes, { initialUrl: '/' });
    expect(await screen.findByTestId('tab-bar', {}, { timeout: 5_000 })).toBeOnTheScreen();
    expect(await background()).toBe(lightTheme.colors.background.primary);
  });
});

describe('sound and haptics (stored only; behavior arrives in Phase 2)', () => {
  it('saves each switch on its own, keeping the other settings', async () => {
    await openSettings();
    fireEvent.press(screen.getByRole('switch', { name: 'Sound' }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ sound: false });
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Sound' })).not.toBeChecked());
    expect(screen.getByRole('switch', { name: 'Haptics' })).toBeChecked();

    fireEvent.press(screen.getByRole('switch', { name: 'Haptics' }));
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]!.body).toEqual({ haptics: false });
    expect(stored).toMatchObject({ sound: false, haptics: false, theme: 'system' });
  });

  it('keeps quick successive changes: an earlier answer never undoes a later switch', async () => {
    const releases: (() => void)[] = [];
    serve(async (request) => {
      if (request.method === 'PATCH') {
        await new Promise<void>((resolve) => releases.push(resolve));
      }
      return a5(request);
    });
    await openSettings();
    fireEvent.press(screen.getByRole('switch', { name: 'Sound' }));
    fireEvent.press(screen.getByRole('switch', { name: 'Haptics' }));
    await settle();

    // Changes are saved one after another, so they reach the server in order.
    expect(patches()).toHaveLength(1);
    await act(async () => releases.shift()?.());
    await waitFor(() => expect(patches()).toHaveLength(2));
    // The first answer (sound off, haptics still on) must not undo the pending haptics change.
    await settle();
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Haptics' })).not.toBeChecked());
    expect(screen.getByRole('switch', { name: 'Sound' })).not.toBeChecked();

    await act(async () => releases.shift()?.());
    await settle();
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Haptics' })).not.toBeChecked());
    expect(screen.getByRole('switch', { name: 'Sound' })).not.toBeChecked();
    expect(stored).toMatchObject({ sound: false, haptics: false });
  });

  it('restores only the failed switch when a save fails', async () => {
    serve((request) =>
      request.method === 'PATCH' && (request.body as object) && 'sound' in (request.body as object)
        ? { status: 500, body: nestError(500, 'boom') }
        : a5(request),
    );
    await openSettings();
    fireEvent.press(screen.getByRole('switch', { name: 'Sound' }));
    expect(
      await screen.findByText("We couldn't save that change. Please try again."),
    ).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Sound' })).toBeChecked();
  });
});

describe('reduced motion (M2: system OR app setting)', () => {
  const routesWithProbe = { ...appRoutes, '(tabs)/insights': MotionProbe };

  it('applies the app setting to the whole app at once', async () => {
    await openSettings(routesWithProbe);
    fireEvent.press(screen.getByRole('switch', { name: 'Reduce motion' }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ reducedMotion: true });

    await act(async () => expoRouter.navigate('/insights'));
    expect(await screen.findByText('motion reduced')).toBeOnTheScreen();
  });

  it('opens with motion reduced when it was saved that way', async () => {
    stored = makePreferences({ reducedMotion: true });
    renderApp(routesWithProbe, { initialUrl: '/insights' });
    expect(await screen.findByText('motion reduced')).toBeOnTheScreen();
  });

  it('keeps motion reduced when the device asks for it, whatever the app setting', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await openSettings();
    expect(
      await screen.findByText('Your device already reduces motion, so it stays reduced here too.', {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Reduce motion' })).not.toBeChecked();
  });
});

describe('notifications (docs/12: Phase 1 builds the structure; each phase adds its categories)', () => {
  it('shows no notification category in Phase 1, because none of their features exist yet', async () => {
    await openSettings();
    expect(screen.queryByRole('header', { name: 'Notifications' })).toBeNull();
    expect(
      screen.queryByText(/reminder|invite|badge|recap|event|challenge|streak/i, {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  });

  it('never asks for notification permission and never sends one', async () => {
    const pkg = jest.requireActual('../../package.json') as {
      dependencies: Record<string, string>;
    };
    await openSettings();
    expect(Object.keys(pkg.dependencies)).not.toContain('expo-notifications');
  });
});

describe('sign out', () => {
  it('signs out on this device and returns to the auth screens', async () => {
    await openSettings();
    const before = requests.length;
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('header', { name: 'Create your account' })).toBeOnTheScreen();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
    // A5 and A3 have no sign-out endpoint: nothing is sent.
    expect(requests.length).toBe(before);
    const secureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: (key: string) => Promise<string | null>;
    };
    await expect(secureStore.getItemAsync('focus-forest.session')).resolves.toBeNull();
  });
});
