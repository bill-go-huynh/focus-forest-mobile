import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';

import { fakeFetch, makeSession, nestError, type FakeRequest } from '../test-utils/api';
import { makeHome } from '../test-utils/core-loop';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { makeEquipment } from '../test-utils/rewards';
import { appRoutes } from '../test-utils/routes';
import { WELCOME_TITLE } from '../test-utils/welcome';

// Boundaries only: secure storage, the network, and the app config.
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
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

/**
 * W.3 Forgot password (owner decision 2026-10-18): from sign in, the person asks for a code by
 * email, then enters it with a new password and is signed in. The app never says whether the
 * email has an account.
 */

const API = 'https://api.example.com';
const future = (ms: number) => new Date(Date.now() + ms).toISOString();
const session = () =>
  makeSession({
    accessTokenExpiresAt: future(15 * 60_000),
    refreshTokenExpiresAt: future(30 * 86_400_000),
  });
const CODE_INVALID = {
  ...nestError(400, 'That code is not right, or it has expired. Ask for a new one.'),
  code: 'reset_code_invalid',
};

let requests: FakeRequest[];
let confirmAnswer: () => { status: number; body?: unknown } | Error;
let offline = false;
const resetCalls = (path: string) =>
  requests.filter((r) => new URL(r.url).pathname === `/auth/password-reset/${path}`);

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = API;
  mockSecureStore.clear();
  await AsyncStorage.clear();
  confirmAnswer = () => ({ status: 200, body: session() });
  offline = false;
  const net = fakeFetch((request) => {
    const { pathname } = new URL(request.url);
    if (offline) return new TypeError('Network request failed');
    if (pathname === '/auth/password-reset/request') return { status: 202, body: {} };
    if (pathname === '/auth/password-reset/confirm') return confirmAnswer();
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (pathname === '/me/home') return { status: 200, body: makeHome() };
    if (pathname === '/me/equipment') return { status: 200, body: makeEquipment() };
    return { status: 404, body: nestError(404, 'Not Found') };
  });
  requests = net.requests;
  globalThis.fetch = net.fetch;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
});
afterEach(() => {
  jest.restoreAllMocks();
});

const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);

async function openForgot() {
  const router = renderApp(appRoutes, { initialUrl: '/' });
  await screen.findByRole('header', { name: WELCOME_TITLE });
  fireEvent.press(screen.getByRole('button', { name: 'I already have an account' }));
  await screen.findByRole('header', { name: 'Welcome back' });
  type('Email', 'mai@example.com');
  fireEvent.press(screen.getByRole('button', { name: 'Forgot password?' }));
  await screen.findByRole('header', { name: 'Reset your password' });
  return router;
}

async function sendCode() {
  fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
  await screen.findByLabelText('6-digit code');
}

describe('forgot password (W.3)', () => {
  it('is offered on sign in, and carries the email typed there', async () => {
    const router = await openForgot();
    expect(router.getPathname()).toBe('/forgot-password');
    expect(screen.getByLabelText('Email').props.value).toBe('mai@example.com');
  });

  it('sends a code, then a new password signs in and opens Home', async () => {
    const router = await openForgot();
    await sendCode();
    expect(resetCalls('request').map((r) => r.body)).toEqual([{ email: 'mai@example.com' }]);
    // The same words whether or not the email has an account.
    expect(
      screen.getByText(
        'If an account uses mai@example.com, we sent it a 6-digit code. It works for 15 minutes.',
      ),
    ).toBeOnTheScreen();

    type('6-digit code', '123456');
    type('New password', 'a brand new password');
    fireEvent.press(screen.getByRole('button', { name: 'Set new password' }));

    expect(await screen.findByTestId('tab-bar')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');
    expect(resetCalls('confirm').map((r) => r.body)).toEqual([
      { email: 'mai@example.com', code: '123456', password: 'a brand new password' },
    ]);
    expect(resetCalls('confirm')[0]!.headers.Authorization).toBeUndefined();
  });

  it('checks the email before sending anything', async () => {
    await openForgot();
    type('Email', 'not an email');
    fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(resetCalls('request')).toEqual([]);
  });

  it('checks the code and the new password before sending them', async () => {
    await openForgot();
    await sendCode();
    type('6-digit code', '12');
    type('New password', 'short');
    fireEvent.press(screen.getByRole('button', { name: 'Set new password' }));
    expect(await screen.findByText('Enter the 6-digit code from the email.')).toBeOnTheScreen();
    expect(screen.getByText('Use at least 8 characters for your password.')).toBeOnTheScreen();
    expect(resetCalls('confirm')).toEqual([]);
  });

  it('says calmly when the code is wrong or expired, and can send a new one', async () => {
    confirmAnswer = () => ({ status: 400, body: CODE_INVALID });
    await openForgot();
    await sendCode();
    type('6-digit code', '000000');
    type('New password', 'a brand new password');
    fireEvent.press(screen.getByRole('button', { name: 'Set new password' }));
    expect(
      await screen.findByText('That code is not right, or it has expired. Ask for a new one.'),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('tab-bar')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Send a new code' }));
    await screen.findByText(
      'If an account uses mai@example.com, we sent it a 6-digit code. It works for 15 minutes.',
    );
    expect(resetCalls('request')).toHaveLength(2);
  });

  it('explains a lost connection', async () => {
    await openForgot();
    offline = true;
    fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(
      await screen.findByText(
        "We couldn't reach Focus Forest. Check your connection and try again.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('6-digit code')).toBeNull();
  });

  it('goes back to sign in', async () => {
    await openForgot();
    fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(await screen.findByRole('header', { name: 'Welcome back' })).toBeOnTheScreen();
  });
});
