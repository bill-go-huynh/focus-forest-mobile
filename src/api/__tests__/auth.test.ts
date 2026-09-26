import {
  fakeFetch,
  makeSession,
  memoryTokenStore,
  nestError,
  NOW,
  type FakeRequest,
} from '../../test-utils/api';
import { createApi } from '../api';
import { HttpError, InvalidResponseError, NetworkError } from '../errors';
import type { Session } from '../session';

const BASE = 'https://api.example.com';
const CREDENTIALS = { email: 'mai@example.com', password: 'correct horse battery' };

async function setup(
  handler: (request: FakeRequest) => { status: number; body?: unknown } | Error,
  stored: Session | null = null,
) {
  const net = fakeFetch(handler);
  const store = memoryTokenStore(stored);
  const api = createApi({ baseUrl: BASE, fetch: net.fetch, store, now: () => NOW });
  return { ...net, store, api };
}

let consoleSpies: jest.SpyInstance[];
beforeEach(() => {
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
    jest.spyOn(console, method).mockImplementation(() => undefined),
  );
});
afterEach(() => {
  for (const spy of consoleSpies) {
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/token|correct horse/i);
  }
  jest.restoreAllMocks();
});

describe('auth API (A3 contract: POST /auth/sign-up, /auth/sign-in, /auth/refresh)', () => {
  describe.each([
    ['signUp', '/auth/sign-up', 201],
    ['signIn', '/auth/sign-in', 200],
  ] as const)('%s', (method, path, status) => {
    it(`posts the credentials to ${path} without an Authorization header`, async () => {
      const { api, requests } = await setup(() => ({ status, body: makeSession() }));
      await api.auth[method](CREDENTIALS);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        url: `${BASE}${path}`,
        method: 'POST',
        body: CREDENTIALS,
      });
      expect(requests[0]!.headers.Authorization).toBeUndefined();
    });

    it('saves the session and becomes authenticated', async () => {
      const { api, store } = await setup(() => ({ status, body: makeSession() }));
      await expect(api.auth[method](CREDENTIALS)).resolves.toEqual({
        id: 'user-1',
        email: 'mai@example.com',
      });
      expect(store.current()).toEqual(makeSession());
      expect(api.session.getSnapshot().status).toBe('authenticated');
    });

    it('saves nothing when the response does not match the contract', async () => {
      const { api, store } = await setup(() => ({ status, body: { accessToken: 'x' } }));
      await expect(api.auth[method](CREDENTIALS)).rejects.toBeInstanceOf(InvalidResponseError);
      expect(store.current()).toBeNull();
    });
  });

  it('reports wrong credentials with the API message, and stays signed out', async () => {
    const { api } = await setup(() => ({
      status: 401,
      body: nestError(401, 'Email or password is incorrect.'),
    }));
    const error = await api.auth.signIn(CREDENTIALS).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 401, messages: ['Email or password is incorrect.'] });
    await api.session.restore();
    expect(api.session.getSnapshot().status).toBe('unauthenticated');
  });

  it('reports a suspended account (403)', async () => {
    const { api } = await setup(() => ({
      status: 403,
      body: nestError(403, 'This account is suspended.'),
    }));
    await expect(api.auth.signIn(CREDENTIALS)).rejects.toMatchObject({
      status: 403,
      messages: ['This account is suspended.'],
    });
  });

  it('reports an email that is already registered (409)', async () => {
    const { api } = await setup(() => ({
      status: 409,
      body: nestError(409, 'An account with this email already exists.'),
    }));
    await expect(api.auth.signUp(CREDENTIALS)).rejects.toMatchObject({ status: 409 });
  });

  describe('restoreSession', () => {
    it('is unauthenticated when nothing is saved', async () => {
      const { api, fetch } = await setup(() => ({ status: 500 }));
      await expect(api.auth.restoreSession()).resolves.toBe('unauthenticated');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('restores a saved session without a network call while the access token is fresh', async () => {
      const { api, fetch } = await setup(() => ({ status: 500 }), makeSession());
      await expect(api.auth.restoreSession()).resolves.toBe('authenticated');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('refreshes an expired access token while restoring', async () => {
      const expired = makeSession({ accessTokenExpiresAt: new Date(NOW - 1).toISOString() });
      const { api, requests, store } = await setup(
        () => ({ status: 200, body: makeSession({}, 2) }),
        expired,
      );
      await expect(api.auth.restoreSession()).resolves.toBe('authenticated');
      expect(requests[0]).toMatchObject({
        url: `${BASE}/auth/refresh`,
        body: { refreshToken: 'refresh-token-1' },
      });
      expect(store.current()).toEqual(makeSession({}, 2));
    });

    it('stays signed in when offline, so the app still opens without a network', async () => {
      const expired = makeSession({ accessTokenExpiresAt: new Date(NOW - 1).toISOString() });
      const { api } = await setup(() => new TypeError('Network request failed'), expired);
      await expect(api.auth.restoreSession()).resolves.toBe('authenticated');
    });

    it('signs out when the saved refresh token is rejected', async () => {
      const expired = makeSession({ accessTokenExpiresAt: new Date(NOW - 1).toISOString() });
      const { api, store } = await setup(
        () => ({ status: 401, body: nestError(401, 'Sign in again to continue.') }),
        expired,
      );
      await expect(api.auth.restoreSession()).resolves.toBe('unauthenticated');
      expect(store.current()).toBeNull();
    });
  });

  it('signs out locally (the API has no sign-out endpoint), without a network call', async () => {
    const { api, store, fetch } = await setup(() => ({ status: 500 }), makeSession());
    await api.auth.restoreSession();
    await api.auth.signOut();
    expect(store.current()).toBeNull();
    expect(api.session.getSnapshot().status).toBe('unauthenticated');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('surfaces a network failure during sign in as a network error', async () => {
    const { api } = await setup(() => new TypeError('Network request failed'));
    await expect(api.auth.signIn(CREDENTIALS)).rejects.toBeInstanceOf(NetworkError);
  });
});
