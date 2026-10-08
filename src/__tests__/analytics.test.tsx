import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import { analyticsKey } from '../analytics/analytics-queue';
import { NetworkError, type HomeResponse } from '../api';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makeCurrentTree, makeHome } from '../test-utils/core-loop';
import { forestMonths, forestPage } from '../test-utils/forest';
import { makeLifetime } from '../test-utils/insights';
import { makePreferences } from '../test-utils/preferences';
import { makeTopic } from '../test-utils/topics';
import { renderApp } from '../test-utils/render-app';
import { makeEquipment } from '../test-utils/rewards';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { until } from '../test-utils/sheets';
import { treeDto } from '../test-utils/trees';

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

const API = 'https://api.example.com';
type Reply = { status: number; body?: unknown } | Error;
interface SentEvent {
  id: string;
  name: string;
  localDate: string;
  appVersion: string;
  props: Record<string, number>;
}

/** The app's API with a recording analytics endpoint and a stored `shareUsageData`. */
function analyticsApi() {
  const state = { shareUsageData: true, analyticsDown: false, events: [] as SentEvent[] };
  const handler = ({ url, method, body }: FakeRequest): Reply => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences') {
      if (method === 'PATCH') {
        Object.assign(state, body as object);
      }
      return { status: 200, body: { ...makePreferences(), shareUsageData: state.shareUsageData } };
    }
    if (pathname === '/me/analytics/events' && method === 'POST') {
      if (state.analyticsDown) return new NetworkError();
      const events = (body as { events: SentEvent[] }).events;
      state.events.push(...events);
      return { status: 202, body: { accepted: events.length, ignored: 0 } };
    }
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics')
      return { status: 200, body: [makeTopic({ lastPlannedMinutes: 25 })] };
    if (pathname === '/me/home') {
      const home: HomeResponse = {
        ...makeHome({ recentTopics: [makeTopic({ name: 'Reading', lastPlannedMinutes: 25 })] }),
        tree: treeDto({ stage: 'sprout' }),
      };
      return { status: 200, body: home };
    }
    if (pathname === '/me/trees/current') return { status: 200, body: makeCurrentTree() };
    if (pathname === '/me/equipment') return { status: 200, body: makeEquipment() };
    if (pathname === '/me/forest') return { status: 200, body: forestPage(forestMonths(3)) };
    if (pathname === '/me/profile/stats') return { status: 200, body: makeLifetime() };
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
  return { handler, state };
}

let server: ReturnType<typeof analyticsApi>;
const originalFetch = globalThis.fetch;
let appStateListeners: ((state: AppStateStatus) => void)[] = [];

beforeEach(async () => {
  await AsyncStorage.clear();
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  server = analyticsApi();
  globalThis.fetch = fakeFetch(server.handler).fetch;
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') appStateListeners.push(listener as (state: AppStateStatus) => void);
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const names = () => server.state.events.map((event) => event.name);
const pause = (ms = 300) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

describe('product analytics for the checkpoint (CR.6)', () => {
  it('sends one app_opened per launch, with the app version and a local date', async () => {
    renderApp(appRoutes, { initialUrl: '/' });
    await until(() => names().includes('app_opened'));
    const opened = server.state.events.find((event) => event.name === 'app_opened')!;
    expect(opened).toMatchObject({ appVersion: '0.1.0', props: {} });
    expect(opened.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(opened.id).toMatch(/^[0-9a-f-]{36}$/);
    await pause(500);
    expect(names().filter((name) => name === 'app_opened')).toHaveLength(1);
  });

  it('records screen opens and a return to the app', async () => {
    renderApp(appRoutes, { initialUrl: '/forest' });
    await until(() => names().includes('forest_opened'), 10_000);
    act(() => appStateListeners.forEach((listener) => listener('background')));
    act(() => appStateListeners.forEach((listener) => listener('active')));
    await until(() => names().includes('app_foregrounded'), 10_000);
  });

  it('sends nothing for a user who does not share usage data', async () => {
    server.state.shareUsageData = false;
    renderApp(appRoutes, { initialUrl: '/forest' });
    await screen.findByRole('header', { name: 'Forest' });
    await pause(3_000);
    expect(server.state.events).toEqual([]);
  });

  it('stops at once when the user turns sharing off in Settings', async () => {
    renderApp(appRoutes, { initialUrl: '/profile/settings' });
    await until(() => names().includes('app_opened'));
    const toggle = await screen.findByRole('switch', { name: /Share usage data/ });
    fireEvent(toggle, 'valueChange', false);
    await until(() => server.state.shareUsageData === false);
    const sent = server.state.events.length;
    act(() => appStateListeners.forEach((listener) => listener('background')));
    act(() => appStateListeners.forEach((listener) => listener('active')));
    await pause(3_000);
    expect(server.state.events).toHaveLength(sent);
    expect(screen.getByText(/Your notes and topic names are never shared/)).toBeOnTheScreen();
  });

  it('keeps events offline and sends them once the server can be reached', async () => {
    server.state.analyticsDown = true;
    renderApp(appRoutes, { initialUrl: '/forest' });
    await screen.findByRole('header', { name: 'Forest' });
    await pause(2_500);
    expect(server.state.events).toEqual([]);
    server.state.analyticsDown = false;
    act(() => appStateListeners.forEach((listener) => listener('background')));
    act(() => appStateListeners.forEach((listener) => listener('active')));
    await until(
      () => ['app_opened', 'forest_opened'].every((name) => names().includes(name)),
      10_000,
    );
  });

  it('forgets the user’s queued events on sign-out', async () => {
    server.state.analyticsDown = true;
    renderApp(appRoutes, { initialUrl: '/profile/settings' });
    await screen.findByRole('switch', { name: /Share usage data/ });
    const stored = async () => AsyncStorage.getItem(analyticsKey('user-1'));
    let queued: string | null = null;
    await until(() => {
      void stored().then((value) => (queued = value));
      return queued !== null && queued.includes('app_opened');
    });
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    let after: string | null = 'pending';
    await until(() => {
      void stored().then((value) => (after = value));
      return after === null;
    });
  });

  it('records a started focus with its planned minutes only', async () => {
    renderApp(appRoutes, { initialUrl: '/' });
    fireEvent.press(await screen.findByRole('button', { name: 'Start Reading, 25 minutes' }));
    await until(() => names().includes('focus_started'), 10_000);
    expect(server.state.events.find((event) => event.name === 'focus_started')?.props).toEqual({
      plannedMinutes: 25,
    });
  });
});
