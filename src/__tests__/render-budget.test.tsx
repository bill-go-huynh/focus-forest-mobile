import { act, screen } from 'expo-router/testing-library';
import { router as expoRouter } from 'expo-router';
import { AccessibilityInfo } from 'react-native';

import * as composition from '../tree/composition';
import x5 from '../test-utils/x5/community-contract.json';
import { fakeFetch, type FakeRequest } from '../test-utils/api';
import { forestMonths, forestPage } from '../test-utils/forest';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';

/**
 * M7.4 Performance pass (docs/12 Phase 20; Phase 7 owner decision 7: render budgets in tests,
 * device frame times in the device QA). Composing a tree (`composeTree`: every branch, leaf
 * cluster, blossom, and cosmetic) is the costly step; it must run once per tree state, never again
 * for the same tree, and only for the trees a screen actually shows.
 */

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

const API = 'https://api.example.com';
const YEAR_AND_MORE = forestMonths(40);

function api({ url }: FakeRequest) {
  const { pathname } = new URL(url);
  if (pathname === '/me/preferences')
    return { status: 200, body: makePreferences({ reducedMotion: true }) };
  if (pathname === '/me/home') return { status: 200, body: x5.home };
  if (pathname === '/me/forest') return { status: 200, body: forestPage(YEAR_AND_MORE) };
  return { status: 404, body: { statusCode: 404, message: 'Not Found', error: 'Not Found' } };
}

const originalFetch = globalThis.fetch;
let compose: jest.SpyInstance;
beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  globalThis.fetch = fakeFetch(api).fetch;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  compose = jest.spyOn(composition, 'composeTree');
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

describe('render budgets (M7.4)', () => {
  it('composes the Home tree once, and never again while nothing about it changes', async () => {
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: 'Start Focus' });
    await wait(500);
    const settled = compose.mock.calls.length;
    expect(settled).toBeGreaterThan(0);
    expect(settled).toBeLessThanOrEqual(2);

    // Idle, then away to the Forest and back: the same tree is never composed again.
    await wait(1500);
    act(() => expoRouter.navigate('/insights'));
    await wait(300);
    act(() => expoRouter.navigate('/'));
    await wait(500);
    expect(compose.mock.calls.length).toBe(settled);
  });

  it('composes only the trees the Forest shows, not every month it holds', async () => {
    renderApp(appRoutes, { initialUrl: '/forest' });
    await wait(1200);
    // 40 archived months; the list renders a window of them (FlatList windowing).
    expect(compose.mock.calls.length).toBeGreaterThan(0);
    expect(compose.mock.calls.length).toBeLessThanOrEqual(12);
  });
});
