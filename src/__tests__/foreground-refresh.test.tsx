import AsyncStorage from '@react-native-async-storage/async-storage';
import { screen } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';

import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { mockAppState } from '../test-utils/app-state';
import { makeHome } from '../test-utils/core-loop';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { until } from '../test-utils/sheets';

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

/**
 * Coming back to the app reads what is on screen again (owner, 2026-10-21): what changed while
 * it was in the background shows without moving between screens, and a screen that could not
 * load tries again by itself.
 */

let requests: FakeRequest[];
let homeFails: boolean;
let appState: ReturnType<typeof mockAppState>;
const homeReads = () => requests.filter((r) => new URL(r.url).pathname === '/me/home').length;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';
  await AsyncStorage.clear();
  homeFails = false;
  const net = fakeFetch(({ url }) => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (pathname === '/me/home') {
      return homeFails
        ? { status: 400, body: nestError(400, 'Bad Request') }
        : { status: 200, body: makeHome() };
    }
    return { status: 404, body: nestError(404, 'Not Found') };
  });
  requests = net.requests;
  globalThis.fetch = net.fetch;
  appState = mockAppState();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  signInForTest();
});
afterEach(() => jest.restoreAllMocks());

describe('coming back to the app', () => {
  it('reads Home again', async () => {
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: 'Start Focus' });
    await until(() => homeReads() > 0);
    const before = homeReads();
    await appState.emit('background');
    await appState.emit('active');
    await until(() => homeReads() > before);
  });

  it('does not read again while the app stays in the background', async () => {
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: 'Start Focus' });
    await until(() => homeReads() > 0);
    const before = homeReads();
    await appState.emit('background');
    await new Promise((r) => setTimeout(r, 100));
    expect(homeReads()).toBe(before);
  });

  it('loads a screen that failed, without Try again', async () => {
    homeFails = true;
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: 'Try again' });
    homeFails = false;
    await appState.emit('background');
    await appState.emit('active');
    await until(() => screen.queryByRole('button', { name: 'Try again' }) === null);
  });
});
