import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';

/**
 * M7.2 Errors and resilience (docs/12 Phase 20; docs/02: calm, never alarming): a screen that
 * fails shows a calm fallback instead of a white screen, with a way to try again or go Home, and
 * the error is reported (A7.4) only while the person shares usage data.
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
let requests: FakeRequest[];
let sharing = true;
const broken = { now: true };

function Boom() {
  if (broken.now) throw new TypeError('cannot read stage of undefined');
  return <Text>The screen works again</Text>;
}

function api({ url }: FakeRequest) {
  const { pathname } = new URL(url);
  if (pathname === '/me/preferences')
    return { status: 200, body: makePreferences({ shareUsageData: sharing }) };
  if (pathname === '/client-errors') return { status: 202, body: { accepted: 1 } };
  return { status: 404, body: nestError(404, 'Not Found') };
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  sharing = true;
  broken.now = true;
  const net = fakeFetch(api);
  requests = net.requests;
  globalThis.fetch = net.fetch;
  // React logs a caught render error; the test expects one.
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const routes = { ...appRoutes, boom: Boom };
const reports = () => requests.filter((r) => r.url === `${API}/client-errors`);

describe('a screen that fails (M7.2)', () => {
  it('shows a calm fallback, never a white screen, and reports it', async () => {
    renderApp(routes, { initialUrl: '/boom' });
    expect(await screen.findByText('Something went wrong on this screen.')).toBeOnTheScreen();
    expect(screen.getByText('Your focus and your forest are safe.')).toBeOnTheScreen();
    await waitFor(() => expect(reports()).toHaveLength(1));
    const body = reports()[0]!.body as { errors: Record<string, unknown>[] };
    expect(body.errors).toEqual([
      expect.objectContaining({
        kind: 'crash',
        platform: 'ios',
        appVersion: '0.1.0',
        screen: '/boom',
        message: 'TypeError: cannot read stage of undefined',
      }),
    ]);
    // Nothing says who: no token, no account.
    expect(reports()[0]!.headers.Authorization).toBeUndefined();
  });

  it('tries again', async () => {
    renderApp(routes, { initialUrl: '/boom' });
    await screen.findByText('Something went wrong on this screen.');
    broken.now = false;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('The screen works again')).toBeOnTheScreen();
  });

  it('goes Home', async () => {
    const router = renderApp(routes, { initialUrl: '/boom' });
    await screen.findByText('Something went wrong on this screen.');
    broken.now = false;
    fireEvent.press(screen.getByRole('button', { name: 'Go to Home' }));
    await waitFor(() => expect(router.getPathname()).toBe('/'));
  });

  it('reports nothing when the person does not share usage data', async () => {
    sharing = false;
    renderApp(routes, { initialUrl: '/boom' });
    await screen.findByText('Something went wrong on this screen.');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(reports()).toEqual([]);
  });
});
