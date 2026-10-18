import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';

import { onboardingKey } from '../onboarding/onboarding-store';
import { fakeFetch, makeSession, nestError, type FakeRequest } from '../test-utils/api';
import { defaultGoals } from '../test-utils/consistency';
import { makeHome } from '../test-utils/core-loop';
import {
  GOOGLE_ID_TOKEN,
  nextGoogleSignIn,
  setPlayServicesAvailable,
} from '../test-utils/google-signin-mock';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { makeEquipment } from '../test-utils/rewards';
import { appRoutes } from '../test-utils/routes';
import { signUpFromWelcome, WELCOME_TITLE } from '../test-utils/welcome';

// Boundaries only: secure storage, the network, Google (jest-setup), the time zone, the config.
const mockSecureStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
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
jest.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

/**
 * W.2 Google sign-in (docs/08 §3: an extra sign-in method): "Continue with Google" on sign up
 * and sign in. A new Google account onboards like a sign-up (its name and time zone are saved
 * by the server); an existing one opens Home. Backing out of Google's chooser changes nothing.
 */

const API = 'https://api.example.com';
const SESSION_KEY = 'focus-forest.session';
const future = (ms: number) => new Date(Date.now() + ms).toISOString();
const googleSession = (n = 1) =>
  makeSession(
    {
      accessTokenExpiresAt: future(15 * 60_000),
      refreshTokenExpiresAt: future(30 * 86_400_000),
      user: { id: 'user-1', email: 'ada@gmail.com', signInMethod: 'google' },
    },
    n,
  );

let requests: FakeRequest[];
let googleAnswer: () => { status: number; body?: unknown } | Error;
function serve() {
  const net = fakeFetch((request) => {
    const { pathname } = new URL(request.url);
    if (pathname === '/auth/google') return googleAnswer();
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (pathname === '/me/home') return { status: 200, body: makeHome() };
    if (pathname === '/me/goals') return { status: 200, body: defaultGoals() };
    if (pathname === '/me/equipment') return { status: 200, body: makeEquipment() };
    if (pathname === '/me' && request.method === 'DELETE') return { status: 204 };
    return { status: 404, body: nestError(404, 'Not Found') };
  });
  requests = net.requests;
  globalThis.fetch = net.fetch;
}
const googleCalls = () => requests.filter((r) => new URL(r.url).pathname === '/auth/google');

const originalFetch = globalThis.fetch;
beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = API;
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client.apps.googleusercontent.com';
  mockSecureStore.clear();
  await AsyncStorage.clear();
  googleAnswer = () => ({ status: 200, body: { ...googleSession(), created: true } });
  serve();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
});
afterEach(() => {
  delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const openApp = (initialUrl = '/') => renderApp(appRoutes, { initialUrl });
const continueWithGoogle = () =>
  fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));

describe('Continue with Google (W.2)', () => {
  it('creates the account from Google and opens onboarding, with no second profile step', async () => {
    const router = openApp();
    await signUpFromWelcome();
    continueWithGoogle();

    expect(await screen.findByRole('header', { name: 'Your seed is planted' })).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/onboarding');
    expect(GoogleSignin.configure).toHaveBeenCalledWith(
      expect.objectContaining({ webClientId: 'web-client.apps.googleusercontent.com' }),
    );
    expect(googleCalls().map((r) => r.body)).toEqual([
      { idToken: GOOGLE_ID_TOKEN, timezone: 'Europe/Zurich' },
    ]);
    expect(googleCalls()[0]!.headers.Authorization).toBeUndefined();
    // The server saved the Google name and the time zone: no PATCH /me/profile.
    expect(requests.some((r) => new URL(r.url).pathname === '/me/profile')).toBe(false);
    expect(JSON.parse(mockSecureStore.get(SESSION_KEY)!)).toMatchObject({
      user: { signInMethod: 'google' },
    });
    expect(JSON.parse((await AsyncStorage.getItem(onboardingKey('user-1')))!)).toMatchObject({
      status: 'pending',
    });
  });

  it('opens Home for a Google account that already exists, from sign in', async () => {
    googleAnswer = () => ({ status: 200, body: { ...googleSession(), created: false } });
    const router = openApp();
    await screen.findByRole('header', { name: WELCOME_TITLE });
    fireEvent.press(screen.getByRole('button', { name: 'I already have an account' }));
    await screen.findByRole('header', { name: 'Welcome back' });
    continueWithGoogle();

    expect(await screen.findByTestId('tab-bar')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');
    expect(await AsyncStorage.getItem(onboardingKey('user-1'))).toBeNull();
  });

  it('changes nothing when the person backs out of Google', async () => {
    nextGoogleSignIn('cancelled');
    openApp();
    await signUpFromWelcome();
    continueWithGoogle();
    await waitFor(() => expect(GoogleSignin.signIn).toHaveBeenCalled());
    expect(screen.getByRole('header', { name: 'Create your account' })).toBeOnTheScreen();
    expect(googleCalls()).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says to use the password when the email already has a password account', async () => {
    googleAnswer = () => ({
      status: 409,
      body: {
        ...nestError(
          409,
          'This email already has a Focus Forest account. Sign in with your password.',
        ),
        code: 'email_has_password',
      },
    });
    openApp();
    await signUpFromWelcome();
    continueWithGoogle();
    expect(
      await screen.findByText(
        'This email already has a Focus Forest account. Sign in with your password.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('tab-bar')).toBeNull();
  });

  it('explains when Google cannot be used on this device', async () => {
    setPlayServicesAvailable(false);
    openApp();
    await signUpFromWelcome();
    continueWithGoogle();
    expect(
      await screen.findByText("Google sign-in isn't available on this device."),
    ).toBeOnTheScreen();
    expect(googleCalls()).toEqual([]);
  });

  it('explains a lost connection', async () => {
    googleAnswer = () => new TypeError('Network request failed');
    openApp();
    await signUpFromWelcome();
    continueWithGoogle();
    expect(
      await screen.findByText(
        "We couldn't reach Focus Forest. Check your connection and try again.",
      ),
    ).toBeOnTheScreen();
  });

  it('a Google error from the chooser is calm', async () => {
    nextGoogleSignIn({ code: 'SOME_NATIVE_FAILURE' });
    openApp();
    await signUpFromWelcome();
    continueWithGoogle();
    expect(
      await screen.findByText("We couldn't sign you in with Google. Please try again."),
    ).toBeOnTheScreen();
  });

  it('is not offered when the app has no Google client configured', async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    openApp();
    await signUpFromWelcome();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
  });
});

describe('a Google account on this device', () => {
  it('signs out of Google too, so the next sign-in can pick another account', async () => {
    mockSecureStore.set(SESSION_KEY, JSON.stringify(googleSession()));
    openApp('/profile/settings');
    fireEvent.press(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('header', { name: WELCOME_TITLE })).toBeOnTheScreen();
    expect(GoogleSignin.signOut).toHaveBeenCalled();
  });

  it('confirms deleting the account with Google instead of a password', async () => {
    mockSecureStore.set(SESSION_KEY, JSON.stringify(googleSession()));
    openApp('/profile/delete-account');
    await screen.findByRole('header', { name: 'Delete account' });
    expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByRole('header', { name: WELCOME_TITLE })).toBeOnTheScreen();
    const deletion = requests.find((r) => r.method === 'DELETE');
    expect(deletion?.body).toEqual({ googleIdToken: GOOGLE_ID_TOKEN });
  });
});
