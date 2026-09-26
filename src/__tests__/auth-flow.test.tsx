import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { fakeFetch, makeSession, nestError, type FakeRequest } from '../test-utils/api';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { lightTheme } from '../theme';

// Boundaries only: secure storage, the network, the device time zone, and the app config.
const mockSecureStore = new Map<string, string>();
let mockSecureStoreGate: Promise<void> | null = null;
let mockSecureStoreFailure: Error | null = null;
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: jest.fn(async (key: string) => {
    if (mockSecureStoreGate) await mockSecureStoreGate;
    if (mockSecureStoreFailure) throw mockSecureStoreFailure;
    return mockSecureStore.get(key) ?? null;
  }),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));
jest.mock('../auth/device-time-zone', () => ({
  ...jest.requireActual('../auth/device-time-zone'),
  getDeviceTimeZone: () => 'Europe/Zurich',
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

const API = 'https://api.example.com';
const SESSION_KEY = 'focus-forest.session';
const PROFILE = {
  id: 'user-1',
  displayName: 'Mai',
  avatarUrl: null,
  bio: null,
  joinDate: '2026-09-26T10:00:00.000Z',
  timezone: 'Europe/Zurich',
};
const future = (ms: number) => new Date(Date.now() + ms).toISOString();
const freshSession = (n = 1) =>
  makeSession(
    { accessTokenExpiresAt: future(15 * 60_000), refreshTokenExpiresAt: future(30 * 86_400_000) },
    n,
  );

type Handler = (
  request: FakeRequest,
) =>
  { status: number; body?: unknown } | Error | Promise<{ status: number; body?: unknown } | Error>;
let requests: FakeRequest[];
function serve(handler: Handler) {
  const net = fakeFetch(handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
}

/** The API as A3 and A4 define it. */
const happyApi: Handler = (request) => {
  if (request.url === `${API}/auth/sign-up`) return { status: 201, body: freshSession() };
  if (request.url === `${API}/auth/sign-in`) return { status: 200, body: freshSession() };
  if (request.url === `${API}/auth/refresh`) return { status: 200, body: freshSession(2) };
  if (request.url === `${API}/me/profile`) return { status: 200, body: PROFILE };
  if (request.url === `${API}/me/preferences`) return { status: 200, body: makePreferences() };
  return { status: 404, body: nestError(404, 'Not Found') };
};

/** Requests other than the preferences read every signed-in launch makes (M13). */
const authCalls = () => requests.filter((r) => r.url !== `${API}/me/preferences`);

const originalFetch = globalThis.fetch;
let announceSpy: jest.SpyInstance;
let consoleSpies: jest.SpyInstance[];
beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  mockSecureStore.clear();
  mockSecureStoreGate = null;
  mockSecureStoreFailure = null;
  serve(happyApi);
  announceSpy = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation()
    .mockClear();
  consoleSpies = (['log', 'info', 'debug'] as const).map((method) =>
    jest.spyOn(console, method).mockImplementation(() => undefined),
  );
});
afterEach(() => {
  for (const spy of consoleSpies) {
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/token|correct horse/i);
  }
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const stored = () => {
  const raw = mockSecureStore.get(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
};
/** Lets pending promises (such as async validation) finish. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const openApp = (initialUrl = '/') => renderApp(appRoutes, { initialUrl });
const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);

async function fillSignUp({
  email = 'mai@example.com',
  password = 'correct horse',
  name = 'Mai',
} = {}) {
  await screen.findByRole('header', { name: 'Create your account' });
  type('Email', email);
  type('Password', password);
  type('Your name', name);
}

describe('launch: restore the session, then route by its status', () => {
  it('shows only a neutral launch screen while the session is unknown, then the auth screens', async () => {
    let release!: () => void;
    mockSecureStoreGate = new Promise((resolve) => {
      release = resolve;
    });
    openApp();

    expect(await screen.findByTestId('launch-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
    expect(screen.queryByRole('header', { name: 'Create your account' })).toBeNull();
    expect(screen.queryByRole('header', { name: 'Welcome back' })).toBeNull();

    await act(async () => release());
    expect(await screen.findByRole('header', { name: 'Create your account' })).toBeOnTheScreen();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
  });

  it('opens Home directly with a saved session, with no auth call', async () => {
    mockSecureStore.set(SESSION_KEY, JSON.stringify(freshSession()));
    const router = openApp();
    expect(await screen.findByTestId('tab-bar')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');
    expect(authCalls()).toHaveLength(0);
  });

  it('renews an expired access token while restoring, then opens Home', async () => {
    mockSecureStore.set(
      SESSION_KEY,
      JSON.stringify({ ...freshSession(), accessTokenExpiresAt: future(-60_000) }),
    );
    openApp();
    expect(await screen.findByTestId('tab-bar')).toBeOnTheScreen();
    expect(authCalls().map((r) => r.url)).toEqual([`${API}/auth/refresh`]);
    expect(stored().refreshToken).toBe('refresh-token-2');
  });

  it('returns to the auth screens when the saved sign-in is no longer valid', async () => {
    mockSecureStore.set(
      SESSION_KEY,
      JSON.stringify({ ...freshSession(), accessTokenExpiresAt: future(-60_000) }),
    );
    serve(() => ({ status: 401, body: nestError(401, 'Sign in again to continue.') }));
    openApp();
    expect(await screen.findByRole('header', { name: 'Create your account' })).toBeOnTheScreen();
    expect(stored()).toBeNull();
  });

  it('does not get stuck on the launch screen when secure storage cannot be read', async () => {
    mockSecureStoreFailure = new Error('Keychain unavailable');
    openApp();
    expect(await screen.findByRole('header', { name: 'Create your account' })).toBeOnTheScreen();
  });

  it('keeps signed-out users out of the tabs', async () => {
    const router = openApp('/forest');
    expect(await screen.findByRole('header', { name: 'Create your account' })).toBeOnTheScreen();
    expect(router.getPathname()).not.toBe('/forest');
  });

  it('keeps signed-in users out of the auth screens', async () => {
    mockSecureStore.set(SESSION_KEY, JSON.stringify(freshSession()));
    const router = openApp('/sign-in');
    expect(await screen.findByTestId('tab-bar')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');
  });
});

describe('sign up', () => {
  it('creates the account, saves the name and time zone, then opens Home', async () => {
    const router = openApp();
    await fillSignUp();
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByTestId('tab-bar')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');
    expect(authCalls().map((r) => [r.method, r.url])).toEqual([
      ['POST', `${API}/auth/sign-up`],
      ['PATCH', `${API}/me/profile`],
    ]);
    expect(requests[0]!.body).toEqual({ email: 'mai@example.com', password: 'correct horse' });
    expect(requests[0]!.headers.Authorization).toBeUndefined();
    expect(requests[1]!.body).toEqual({ displayName: 'Mai', timezone: 'Europe/Zurich' });
    expect(requests[1]!.headers.Authorization).toBe('Bearer access-token-1');
    expect(stored()).toMatchObject({ refreshToken: 'refresh-token-1' });
  });

  it('stays on sign up until the profile is saved, and cannot be sent twice', async () => {
    let releaseProfile!: () => void;
    serve(async (request) => {
      if (request.url === `${API}/me/profile`) {
        await new Promise<void>((resolve) => {
          releaseProfile = resolve;
        });
      }
      return happyApi(request);
    });
    openApp();
    await fillSignUp();
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    const busy = await screen.findByRole('button', { name: 'Creating your account…' });
    expect(busy).toBeDisabled();
    fireEvent.press(busy);
    // The keyboard's "done" key submits too; it must not start a second sign-up.
    fireEvent(screen.getByLabelText('Your name'), 'submitEditing');
    await settle();
    await waitFor(() => expect(authCalls()).toHaveLength(2));
    expect(screen.queryByTestId('tab-bar')).toBeNull();

    await act(async () => releaseProfile());
    expect(await screen.findByTestId('tab-bar')).toBeOnTheScreen();
    expect(requests.filter((r) => r.url === `${API}/auth/sign-up`)).toHaveLength(1);
  });

  it('offers to retry saving the name when that step fails, without creating a second account', async () => {
    let profileAttempts = 0;
    serve((request) => {
      if (request.url === `${API}/me/profile` && ++profileAttempts === 1) {
        return new TypeError('Network request failed');
      }
      return happyApi(request);
    });
    openApp();
    await fillSignUp();
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText(
        "Your account is ready, but we couldn't save your name yet. Check your connection and try again.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('tab-bar')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('tab-bar')).toBeOnTheScreen();
    expect(requests.filter((r) => r.url === `${API}/auth/sign-up`)).toHaveLength(1);
    expect(requests.filter((r) => r.url === `${API}/me/profile`)).toHaveLength(2);
  });

  it('shows an already-registered email on the email field, and saves no profile', async () => {
    serve(() => ({
      status: 409,
      body: nestError(409, 'An account with this email already exists.'),
    }));
    openApp();
    await fillSignUp();
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('An account with this email already exists.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email').props.accessibilityHint).toBe(
      'An account with this email already exists.',
    );
    expect(requests).toHaveLength(1);
  });

  it('validates gently: no errors while typing, then kind messages on submit, and no request', async () => {
    openApp();
    await fillSignUp({ email: 'mai', password: 'short', name: '' });
    // Let any validation settle before checking that nothing was flagged yet.
    await settle();
    expect(screen.queryByText('Enter a valid email address.')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(screen.getByText('Use at least 8 characters for your password.')).toBeOnTheScreen();
    expect(screen.getByText('Add the name you would like to be called.')).toBeOnTheScreen();
    expect(requests).toHaveLength(0);
  });

  it('clears a field error as soon as it is fixed', async () => {
    openApp();
    await fillSignUp({ email: 'mai' });
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Enter a valid email address.');

    type('Email', 'mai@example.com');

    // Revalidation is a promise chain, not a timer: settle it, then check at once.
    await settle();
    expect(screen.queryByText('Enter a valid email address.')).toBeNull();
  });

  it('sets up the fields for password managers and the right keyboards', async () => {
    openApp();
    await screen.findByRole('header', { name: 'Create your account' });
    expect(screen.getByLabelText('Email').props).toMatchObject({
      keyboardType: 'email-address',
      autoCapitalize: 'none',
      autoComplete: 'email',
    });
    expect(screen.getByLabelText('Password').props).toMatchObject({
      secureTextEntry: true,
      autoComplete: 'new-password',
      textContentType: 'newPassword',
    });
  });
});

describe('sign in', () => {
  async function openSignIn() {
    const router = openApp();
    await screen.findByRole('header', { name: 'Create your account' });
    fireEvent.press(screen.getByRole('button', { name: 'I already have an account' }));
    await screen.findByRole('header', { name: 'Welcome back' });
    return router;
  }

  it('signs in and opens Home, without touching the profile', async () => {
    const router = await openSignIn();
    type('Email', 'mai@example.com');
    type('Password', 'correct horse');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByTestId('tab-bar')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');
    expect(authCalls().map((r) => r.url)).toEqual([`${API}/auth/sign-in`]);
  });

  it('shows and announces wrong credentials, without revealing the password', async () => {
    serve(() => ({ status: 401, body: nestError(401, 'Email or password is incorrect.') }));
    await openSignIn();
    type('Email', 'mai@example.com');
    type('Password', 'correct horse');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email or password is incorrect.')).toBeOnTheScreen();
    expect(announceSpy).toHaveBeenCalledWith('Email or password is incorrect.');
    expect(screen.queryByText(/correct horse/)).toBeNull();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
  });

  it('explains a lost connection differently from wrong credentials', async () => {
    serve(() => new TypeError('Network request failed'));
    await openSignIn();
    type('Email', 'mai@example.com');
    type('Password', 'correct horse');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText(
        "We couldn't reach Focus Forest. Check your connection and try again.",
      ),
    ).toBeOnTheScreen();
  });

  it('never shows a raw server message it does not know', async () => {
    serve(() => ({ status: 500, body: nestError(500, 'db host 10.0.0.3 refused connection') }));
    await openSignIn();
    type('Email', 'mai@example.com');
    type('Password', 'correct horse');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText("We couldn't finish that just now. Please try again."),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/10\.0\.0\.3/)).toBeNull();
  });

  it('asks for both fields before sending anything', async () => {
    await openSignIn();
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email address.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
    expect(requests).toHaveLength(0);
  });

  it('uses the current-password autofill', async () => {
    await openSignIn();
    expect(screen.getByLabelText('Password').props).toMatchObject({
      secureTextEntry: true,
      autoComplete: 'current-password',
      textContentType: 'password',
    });
  });

  it('leads back to sign up', async () => {
    await openSignIn();
    fireEvent.press(screen.getByRole('button', { name: 'Create an account' }));
    expect(await screen.findByRole('header', { name: 'Create your account' })).toBeOnTheScreen();
  });
});

describe('scope (docs/02 onboarding; no features beyond M11)', () => {
  it.each(['Create your account', 'Welcome back'])(
    '"%s" offers no forgot-password, email verification, or social sign-in',
    async (heading) => {
      openApp();
      await screen.findByRole('header', { name: 'Create your account' });
      if (heading === 'Welcome back') {
        fireEvent.press(screen.getByRole('button', { name: 'I already have an account' }));
        await screen.findByRole('header', { name: heading });
      }
      expect(
        screen.queryByText(/forgot|reset|verify|verification|google|apple|facebook|continue with/i),
      ).toBeNull();
    },
  );

  it('has one primary action on each auth screen', async () => {
    openApp();
    await screen.findByRole('header', { name: 'Create your account' });
    const primaries = screen
      .getAllByRole('button')
      .filter(
        (button) =>
          StyleSheet.flatten(button.props.style)?.backgroundColor ===
          lightTheme.colors.accent.primary,
      );
    expect(primaries).toHaveLength(1);
  });
});
