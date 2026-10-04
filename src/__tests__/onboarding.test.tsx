import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';

import { NetworkError } from '../api';
import { fakeFetch, makeSession, nestError, type FakeRequest } from '../test-utils/api';
import { defaultGoals, makeGoals } from '../test-utils/consistency';
import { makeHome } from '../test-utils/core-loop';
import { onboardingKey } from '../onboarding/onboarding-store';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { makeTopic } from '../test-utils/topics';

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

const API = 'https://api.example.com';
const USER = 'user-1';
const reading = makeTopic({ name: 'Reading', lastPlannedMinutes: 25 });
const future = (ms: number) => new Date(Date.now() + ms).toISOString();
const freshSession = () =>
  makeSession({
    accessTokenExpiresAt: future(15 * 60_000),
    refreshTokenExpiresAt: future(30 * 86_400_000),
  });

/**
 * The API for a new account: no daily goal chosen yet (GET /me/goals answers the configured
 * default, `isDefault: true`); the first PUT /me/goals/daily applies today.
 */
function newAccountApi() {
  const state = { goals: defaultGoals(), goalsOffline: false };
  const handler = ({ url, method, body }: FakeRequest) => {
    const { pathname } = new URL(url);
    if (pathname === '/auth/sign-up') return { status: 201, body: freshSession() };
    if (pathname === '/auth/sign-in') return { status: 200, body: freshSession() };
    if (pathname === '/me/profile')
      return {
        status: 200,
        body: {
          id: 'user-1',
          displayName: 'Mai',
          avatarUrl: null,
          bio: null,
          joinDate: '2026-10-07T10:00:00.000Z',
          timezone: 'Europe/Zurich',
        },
      };
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics') return { status: 200, body: [reading] };
    if (pathname === '/me/home') {
      // A new account mid-month: this month's seed, on prorated thresholds.
      const home = makeHome({ goals: state.goals }, { stage: 'seed', fullness: 0, blossoms: 0 });
      return { status: 200, body: { ...home, tree: { ...home.tree, partialFirstMonth: true } } };
    }
    if (pathname === '/me/goals') return { status: 200, body: state.goals };
    if (pathname === '/me/goals/daily' && method === 'PUT') {
      if (state.goalsOffline) return new NetworkError();
      const { minutes } = body as { minutes: number };
      state.goals = makeGoals({ minutes, isDefault: false, pending: null });
      return { status: 200, body: state.goals };
    }
    return { status: 404, body: nestError(404, 'Not Found') };
  };
  return { handler, state };
}

let server: ReturnType<typeof newAccountApi>;
let requests: FakeRequest[];
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = API;
  await AsyncStorage.clear();
  mockSecureStore.clear();
  server = newAccountApi();
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
});
afterEach(async () => {
  await settleSheetTransitions();
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const goalWrites = () => requests.filter((r) => r.url === `${API}/me/goals/daily`);
const pause = (ms = 200) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);

async function signUp() {
  const router = renderApp(appRoutes, { initialUrl: '/' });
  await screen.findByRole('header', { name: 'Create your account' });
  type('Email', 'mai@example.com');
  type('Password', 'correct horse');
  type('Your name', 'Mai');
  fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByRole('header', { name: 'One month, one tree' });
  return router;
}

async function toDailyGoal() {
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('header', { name: 'A daily goal' });
}

describe('onboarding after sign-up (docs/02, docs/05)', () => {
  it('explains one month, one tree, and plants the user’s seed', async () => {
    const router = await signUp();
    expect(router.getPathname()).toBe('/onboarding');
    expect(
      screen.getByText(
        "Each focus session grows this month's tree. When the month ends, it joins your forest.",
      ),
    ).toBeOnTheScreen();
    expect(await screen.findByRole('image')).toBeOnTheScreen();
    expect(screen.getByText('This month’s tree starts today.')).toBeOnTheScreen();
  });

  it('suggests the server’s default daily goal and saves nothing until chosen', async () => {
    await signUp();
    await toDailyGoal();
    expect(
      await screen.findByText('Suggested: 30 min. You can change it anytime.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '30 minutes a day' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    await pause();
    expect(goalWrites()).toEqual([]);
  });

  it('saves the chosen first goal once, which the server applies today', async () => {
    await signUp();
    await toDailyGoal();
    await screen.findByRole('button', { name: '45 minutes a day' });
    fireEvent.press(screen.getByRole('button', { name: '45 minutes a day' }));
    fireEvent.press(screen.getByRole('button', { name: 'Set my daily goal' }));
    fireEvent.press(screen.getByRole('button', { name: 'Set my daily goal' }));
    await screen.findByRole('header', { name: 'Your first session' });
    expect(screen.getByText('Your daily goal is 45 min, starting today.')).toBeOnTheScreen();
    expect(goalWrites().map((r) => [r.method, r.body])).toEqual([['PUT', { minutes: 45 }]]);
  });

  it('skips the goal without creating one', async () => {
    await signUp();
    await toDailyGoal();
    fireEvent.press(await screen.findByRole('button', { name: 'Skip for now' }));
    await screen.findByRole('header', { name: 'Your first session' });
    await pause();
    expect(goalWrites()).toEqual([]);
    expect(screen.queryByText(/starting today/)).toBeNull();
  });

  it('says calmly when the goal cannot be saved, and still lets the user skip', async () => {
    server.state.goalsOffline = true;
    await signUp();
    await toDailyGoal();
    fireEvent.press(await screen.findByRole('button', { name: 'Set my daily goal' }));
    expect(
      await screen.findByText("You're offline, so nothing was changed. Connect and try again."),
    ).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'A daily goal' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));
    await screen.findByRole('header', { name: 'Your first session' });
  });

  it('ends on the first session: the Phase 2 Start Focus, or Home', async () => {
    const router = await signUp();
    await toDailyGoal();
    fireEvent.press(await screen.findByRole('button', { name: 'Skip for now' }));
    await screen.findByRole('header', { name: 'Your first session' });
    fireEvent.press(screen.getByRole('button', { name: 'Start Focus' }));
    expect(await screen.findByText('Choose a topic')).toBeOnTheScreen();
    await settleSheetTransitions();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await until(() => screen.queryByText('Choose a topic') === null);
    fireEvent.press(screen.getByRole('button', { name: 'Go to Home' }));
    expect(await screen.findByTestId('tab-bar')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');
  });
});

describe('existing users', () => {
  it('never see onboarding on sign-in, and their default goal is not saved for them', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Create your account' });
    fireEvent.press(screen.getByRole('button', { name: 'I already have an account' }));
    await screen.findByRole('header', { name: 'Welcome back' });
    type('Email', 'mai@example.com');
    type('Password', 'correct horse');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByTestId('tab-bar')).toBeOnTheScreen();
    await pause(300);
    expect(router.getPathname()).toBe('/');
    expect(screen.queryByRole('header', { name: 'One month, one tree' })).toBeNull();
    expect(goalWrites()).toEqual([]);
  });
});

const storedOnboarding = async (userId = USER) => {
  const raw = await AsyncStorage.getItem(onboardingKey(userId));
  return raw === null ? null : JSON.parse(raw);
};
async function untilStored(expected: unknown, userId = USER) {
  for (let i = 0; i < 100; i += 1) {
    if (JSON.stringify(await storedOnboarding(userId)) === JSON.stringify(expected)) return;
    await pause(50);
  }
  expect(await storedOnboarding(userId)).toEqual(expected);
}
/** A kill and relaunch: the saved sign-in and device storage stay. */
async function relaunch() {
  screen.unmount();
  const router = renderApp(appRoutes, { initialUrl: '/' });
  await screen.findByRole('button', { name: /Start Focus|Resume focus|Continue|Skip for now/ });
  return router;
}

describe('durable onboarding state', () => {
  it('marks a new account pending as soon as it is created', async () => {
    await signUp();
    await untilStored({ version: 1, status: 'pending', step: 'concept' });
  });

  it('resumes each step after a kill: the concept, the goal, the first session', async () => {
    await signUp();
    await untilStored({ version: 1, status: 'pending', step: 'concept' });
    let router = await relaunch();
    expect(await screen.findByRole('header', { name: 'One month, one tree' })).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/onboarding');

    await toDailyGoal();
    await untilStored({ version: 1, status: 'pending', step: 'goal' });
    router = await relaunch();
    expect(await screen.findByRole('header', { name: 'A daily goal' })).toBeOnTheScreen();

    fireEvent.press(await screen.findByRole('button', { name: 'Skip for now' }));
    await screen.findByRole('header', { name: 'Your first session' });
    await untilStored({ version: 1, status: 'pending', step: 'first-session' });
    router = await relaunch();
    expect(await screen.findByRole('header', { name: 'Your first session' })).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/onboarding');
    expect(goalWrites()).toEqual([]);
  });

  it('completes on Go to Home, and never comes back', async () => {
    await signUp();
    await toDailyGoal();
    fireEvent.press(await screen.findByRole('button', { name: 'Skip for now' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Go to Home' }));
    await untilStored({ version: 1, status: 'complete' });
    const router = await relaunch();
    await pause(300);
    expect(router.getPathname()).toBe('/');
    expect(screen.queryByRole('header', { name: 'One month, one tree' })).toBeNull();
  });

  it('completes when the first focus starts from the last step, before Focus opens', async () => {
    const router = await signUp();
    await toDailyGoal();
    fireEvent.press(await screen.findByRole('button', { name: 'Skip for now' }));
    await screen.findByRole('header', { name: 'Your first session' });
    fireEvent.press(screen.getByRole('button', { name: 'Start Focus' }));
    fireEvent.press(await screen.findByRole('button', { name: /^Reading/ }));
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/focus');
    expect(await storedOnboarding()).toEqual({ version: 1, status: 'complete' });

    await relaunch();
    await pause(300);
    expect(screen.queryByRole('header', { name: 'Your first session' })).toBeNull();
  });

  it('keeps each user’s own onboarding: another user’s pending state never shows', async () => {
    await AsyncStorage.setItem(
      onboardingKey('user-2'),
      JSON.stringify({ version: 1, status: 'pending', step: 'goal' }),
    );
    const router = renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Create your account' });
    fireEvent.press(screen.getByRole('button', { name: 'I already have an account' }));
    await screen.findByRole('header', { name: 'Welcome back' });
    type('Email', 'mai@example.com');
    type('Password', 'correct horse');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByTestId('tab-bar')).toBeOnTheScreen();
    await pause(300);
    expect(router.getPathname()).toBe('/');
    expect(await storedOnboarding('user-2')).toEqual({
      version: 1,
      status: 'pending',
      step: 'goal',
    });
    expect(await storedOnboarding()).toBeNull();
  });

  it('lets a user with a corrupt onboarding entry into the app, and sets it aside', async () => {
    await signUp();
    await untilStored({ version: 1, status: 'pending', step: 'concept' });
    await AsyncStorage.setItem(onboardingKey(USER), '{not json');
    const router = await relaunch();
    await pause(300);
    expect(router.getPathname()).toBe('/');
    expect(await AsyncStorage.getItem(`${onboardingKey(USER)}/quarantine`)).toBe('{not json');
  });
});
