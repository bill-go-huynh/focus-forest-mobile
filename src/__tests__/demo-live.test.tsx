import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';

import { celebrationsKey } from '../celebrations/celebration-store';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { mockAppState } from '../test-utils/app-state';
import { makeGrowth, makeHome } from '../test-utils/core-loop';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { makeSessionResult } from '../test-utils/sessions';
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
 * DM.3 The demo live channel (`/demo/live`): a demo account's open app hears what an admin
 * changed on the Demo page. A session arrives as the server answered it, so the app celebrates
 * it as its own; anything else is read again. Which accounts are demo accounts is the server's
 * call (a demo world may use any email): an account it turns away stops listening.
 */

const API = 'https://api.example.com';
const USER = 'user-1';

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  push(message: unknown) {
    act(() => this.onmessage?.({ data: JSON.stringify(message) }));
  }
}

let requests: FakeRequest[];
let appState: ReturnType<typeof mockAppState>;
const homeReads = () => requests.filter((r) => new URL(r.url).pathname === '/me/home').length;
const originalSocket = (globalThis as { WebSocket?: unknown }).WebSocket;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = API;
  await AsyncStorage.clear();
  FakeSocket.all = [];
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
  const net = fakeFetch(({ url }) => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (pathname === '/me/home') return { status: 200, body: makeHome() };
    return { status: 404, body: nestError(404, 'Not Found') };
  });
  requests = net.requests;
  globalThis.fetch = net.fetch;
  appState = mockAppState();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
afterEach(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = originalSocket;
  jest.restoreAllMocks();
});

const demoSockets = () =>
  FakeSocket.all.filter((s) => s.url === `${'wss://api.example.com'}/demo/live`);

describe('demo live changes (DM.3)', () => {
  it('connects whatever the email, and sends its token first', async () => {
    signInForTest({ id: USER, email: 'bill.presenter@gmail.com' });
    renderApp(appRoutes, { initialUrl: '/' });
    await until(() => demoSockets().length === 1);
    await until(() => demoSockets()[0]!.sent.length > 0);
    expect(demoSockets()[0]!.sent[0]).toEqual({ type: 'auth', token: expect.any(String) });
  });

  it.each(['not_a_demo_account', 'demo_off'])(
    'stops listening for good when the server answers %s',
    async (code) => {
      signInForTest({ id: USER, email: 'mai@example.com' });
      renderApp(appRoutes, { initialUrl: '/' });
      await screen.findByTestId('tab-bar');
      await until(() => demoSockets().length === 1 && demoSockets()[0]!.sent.length > 0);
      demoSockets()[0]!.push({ type: 'error', code });
      expect(demoSockets()[0]!.readyState).toBe(3);
      await appState.emit('background');
      await appState.emit('active');
      await act(() => new Promise((r) => setTimeout(r, 100)));
      expect(demoSockets()).toHaveLength(1);
    },
  );

  it('listens again after coming back to the foreground', async () => {
    signInForTest({ id: USER, email: 'demo3@focusforest.test' });
    renderApp(appRoutes, { initialUrl: '/' });
    await until(() => demoSockets().length === 1);
    await appState.emit('background');
    expect(demoSockets()[0]!.readyState).toBe(3);
    await appState.emit('active');
    await until(() => demoSockets().length === 2);
  });

  it('keeps a session from the admin to celebrate, and reads Home again', async () => {
    signInForTest({ id: USER, email: 'demo3@focusforest.test' });
    renderApp(appRoutes, { initialUrl: '/' });
    await until(() => demoSockets().length === 1 && homeReads() > 0);
    const before = homeReads();
    const session = {
      ...makeSessionResult({ status: 'completed' }),
      growth: makeGrowth(),
      progression: null,
    };
    demoSockets()[0]!.push({ type: 'session', session });
    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(celebrationsKey(USER));
      expect(raw).toContain(session.id);
    });
    await until(() => homeReads() > before);
  });

  it('reads everything again on a refresh', async () => {
    signInForTest({ id: USER, email: 'demo3@focusforest.test' });
    renderApp(appRoutes, { initialUrl: '/' });
    await until(() => demoSockets().length === 1 && homeReads() > 0);
    const before = homeReads();
    demoSockets()[0]!.push({ type: 'refresh', reason: 'reaction' });
    await until(() => homeReads() > before);
  });

  it('ignores a message it does not understand', async () => {
    signInForTest({ id: USER, email: 'demo3@focusforest.test' });
    renderApp(appRoutes, { initialUrl: '/' });
    await until(() => demoSockets().length === 1 && homeReads() > 0);
    demoSockets()[0]!.push({ type: 'session', session: { nope: true } });
    demoSockets()[0]!.push('not json');
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(await AsyncStorage.getItem(celebrationsKey(USER))).toBeNull();
  });
});
