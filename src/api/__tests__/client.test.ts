import { z } from 'zod';

import {
  fakeFetch,
  makeSession,
  memoryTokenStore,
  nestError,
  NOW,
  type FakeRequest,
} from '../../test-utils/api';
import { createApi } from '../api';
import {
  ApiError,
  ConfigurationError,
  HttpError,
  InvalidResponseError,
  NetworkError,
  UnauthenticatedError,
} from '../errors';
import type { Session } from '../session';

const BASE = 'https://api.example.com';
const PROFILE = `${BASE}/me/profile`;
const REFRESH = `${BASE}/auth/refresh`;

const bearer = (request: FakeRequest) => request.headers.Authorization;

/** A server that accepts only the listed access tokens and rotates on refresh. */
function server({
  valid = ['access-token-1'],
  refresh = (request: FakeRequest) =>
    request.body && (request.body as { refreshToken: string }).refreshToken === 'refresh-token-1'
      ? { status: 200, body: makeSession({}, 2) }
      : { status: 401, body: nestError(401, 'Sign in again to continue.') },
}: {
  valid?: string[];
  refresh?: (request: FakeRequest) => { status: number; body?: unknown } | Error;
} = {}) {
  const accepted = new Set(valid);
  return (request: FakeRequest) => {
    if (request.url === REFRESH) {
      const reply = refresh(request);
      if (!(reply instanceof Error) && reply.status === 200) {
        accepted.add((reply.body as Session).accessToken);
      }
      return reply;
    }
    const token = bearer(request)?.replace('Bearer ', '');
    return token && accepted.has(token)
      ? { status: 200, body: { displayName: 'Mai', token: undefined } }
      : { status: 401, body: nestError(401, 'Sign in to continue.') };
  };
}

async function setup(
  handler: Parameters<typeof fakeFetch>[0],
  { session = makeSession() as Session | null, baseUrl = BASE as string | (() => string) } = {},
) {
  const net = fakeFetch(handler);
  const store = memoryTokenStore(session);
  const api = createApi({ baseUrl, fetch: net.fetch, store, now: () => NOW, timeoutMs: 50 });
  await api.session.restore();
  return { ...net, store, api };
}

let consoleSpies: jest.SpyInstance[];
beforeEach(() => {
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
    jest.spyOn(console, method).mockImplementation(() => undefined),
  );
});
afterEach(() => {
  // Tokens and secrets are never logged (A3 rule, docs/08 §3).
  for (const spy of consoleSpies) {
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toMatch(/access-token|refresh-token|password/i);
  }
  jest.restoreAllMocks();
});

describe('API client', () => {
  describe('requests', () => {
    it('joins the path to the base URL and sends JSON', async () => {
      const { api, requests } = await setup(() => ({ status: 201, body: { ok: true } }));
      await api.client.request('/me/preferences', { method: 'PATCH', body: { sound: false } });
      expect(requests[0]).toMatchObject({
        url: `${BASE}/me/preferences`,
        method: 'PATCH',
        body: { sound: false },
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
    });

    it('attaches the access token as a Bearer Authorization header', async () => {
      const { api, requests } = await setup(server());
      await api.client.request('/me/profile');
      expect(bearer(requests[0]!)).toBe('Bearer access-token-1');
    });

    it('sends no Authorization header on public requests', async () => {
      const { api, requests } = await setup(() => ({ status: 200, body: {} }));
      await api.client.request('/auth/sign-in', { method: 'POST', body: {}, auth: false });
      expect(bearer(requests[0]!)).toBeUndefined();
    });

    it('sends no Authorization header when signed out', async () => {
      const { api, requests } = await setup(() => ({ status: 200, body: {} }), { session: null });
      await api.client.request('/health', { auth: false });
      expect(bearer(requests[0]!)).toBeUndefined();
    });

    it('rejects an authenticated request when signed out, without calling the network', async () => {
      const { api, fetch } = await setup(server(), { session: null });
      await expect(api.client.request('/me/profile')).rejects.toBeInstanceOf(UnauthenticatedError);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('returns the parsed JSON body', async () => {
      const { api } = await setup(() => ({ status: 200, body: { displayName: 'Mai' } }));
      await expect(api.client.request('/me/profile')).resolves.toEqual({ displayName: 'Mai' });
    });

    it('returns undefined for an empty body', async () => {
      const { api } = await setup(() => ({ status: 204 }));
      await expect(api.client.request('/x', { method: 'DELETE' })).resolves.toBeUndefined();
    });

    it('validates the body against a schema when one is given', async () => {
      const { api } = await setup(() => ({ status: 200, body: { displayName: 42 } }));
      const schema = z.object({ displayName: z.string() });
      await expect(api.client.request('/me/profile', { schema })).rejects.toBeInstanceOf(
        InvalidResponseError,
      );
    });
  });

  describe('expired access token (refresh once, then retry)', () => {
    it('refreshes once on 401 and retries with the new token', async () => {
      const { api, requests, store } = await setup(server({ valid: [] }));

      await expect(api.client.request('/me/profile')).resolves.toMatchObject({
        displayName: 'Mai',
      });

      expect(requests.map((r) => r.url)).toEqual([PROFILE, REFRESH, PROFILE]);
      expect(requests[1]!.body).toEqual({ refreshToken: 'refresh-token-1' });
      expect(bearer(requests[1]!)).toBeUndefined();
      expect(bearer(requests[2]!)).toBe('Bearer access-token-2');
      expect(store.current()?.refreshToken).toBe('refresh-token-2');
    });

    it('refreshes before sending when the access token has already expired', async () => {
      const expired = makeSession({ accessTokenExpiresAt: new Date(NOW - 1).toISOString() });
      const { api, requests } = await setup(server({ valid: [] }), { session: expired });

      await api.client.request('/me/profile');

      expect(requests.map((r) => r.url)).toEqual([REFRESH, PROFILE]);
      expect(bearer(requests[1]!)).toBe('Bearer access-token-2');
    });

    it('does not refresh a second time when the retry is still rejected', async () => {
      const alwaysRejects = (request: FakeRequest) =>
        request.url === REFRESH
          ? { status: 200, body: makeSession({}, 2) }
          : { status: 401, body: nestError(401, 'Sign in to continue.') };
      const { api, requests, store } = await setup(alwaysRejects);

      await expect(api.client.request('/me/profile')).rejects.toBeInstanceOf(UnauthenticatedError);

      expect(requests.filter((r) => r.url === REFRESH)).toHaveLength(1);
      expect(requests).toHaveLength(3);
      expect(store.current()).toBeNull();
      expect(api.session.getSnapshot().status).toBe('unauthenticated');
    });

    it('ends the session when the refresh is rejected, and reports it as an auth error', async () => {
      const { api, store } = await setup(
        server({
          valid: [],
          refresh: () => ({ status: 401, body: nestError(401, 'Sign in again to continue.') }),
        }),
      );

      const error = await api.client.request('/me/profile').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthenticatedError);
      expect((error as ApiError).kind).toBe('unauthenticated');
      expect(store.current()).toBeNull();
      expect(api.session.getSnapshot()).toEqual({ status: 'unauthenticated', user: null });
    });

    it('shares one refresh between concurrent requests that all get 401', async () => {
      const { api, requests } = await setup(server({ valid: [] }));

      const results = await Promise.all([
        api.client.request('/me/profile'),
        api.client.request('/me/profile'),
        api.client.request('/me/profile'),
      ]);

      expect(results).toHaveLength(3);
      expect(requests.filter((r) => r.url === REFRESH)).toHaveLength(1);
      const retries = requests.filter((r) => bearer(r) === 'Bearer access-token-2');
      expect(retries).toHaveLength(3);
    });

    it('retries without refreshing again when another request already refreshed', async () => {
      let releaseSlow!: () => void;
      const slow = new Promise<void>((resolve) => {
        releaseSlow = resolve;
      });
      const base = server({ valid: [] });
      const { api, requests } = await setup(async (request) => {
        // The first request is answered only after the second one has refreshed.
        if (requests.length === 1) await slow;
        return base(request);
      });

      const first = api.client.request('/me/profile');
      await api.client.request('/me/profile');
      releaseSlow();
      await first;

      expect(requests.filter((r) => r.url === REFRESH)).toHaveLength(1);
    });
  });

  describe('network errors are not auth errors', () => {
    it('reports a failed connection as a network error, and keeps the session', async () => {
      const { api, store } = await setup(() => new TypeError('Network request failed'));

      const error = await api.client.request('/me/profile').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NetworkError);
      expect(error).not.toBeInstanceOf(UnauthenticatedError);
      expect((error as ApiError).kind).toBe('network');
      expect(store.current()).toEqual(makeSession());
      expect(api.session.getSnapshot().status).toBe('authenticated');
    });

    it('reports a request that takes too long as a network error', async () => {
      const { api } = await setup(
        (request) =>
          new Promise((resolve) => {
            void request;
            setTimeout(() => resolve({ status: 200, body: {} }), 1_000);
          }),
      );
      await expect(api.client.request('/me/profile')).rejects.toBeInstanceOf(NetworkError);
    });

    it('keeps the session when the refresh itself cannot reach the server', async () => {
      const { api, store } = await setup(
        server({ valid: [], refresh: () => new TypeError('Network request failed') }),
      );
      await expect(api.client.request('/me/profile')).rejects.toBeInstanceOf(NetworkError);
      expect(store.current()).toEqual(makeSession());
      expect(api.session.getSnapshot().status).toBe('authenticated');
    });
  });

  describe('HTTP errors', () => {
    it.each([
      ['a single message', 'Enter a valid email address.', ['Enter a valid email address.']],
      [
        'a list of messages',
        ['Enter a valid email address.', 'Use at least 8 characters for your password.'],
        ['Enter a valid email address.', 'Use at least 8 characters for your password.'],
      ],
    ])('carries the API messages for %s', async (_case, message, expected) => {
      const { api } = await setup(() => ({ status: 400, body: nestError(400, message) }));
      const error = await api.client.request('/me/profile').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({ kind: 'http', status: 400, messages: expected });
    });

    it('treats 403 as an HTTP error, not as signed out', async () => {
      const { api } = await setup(() => ({ status: 403, body: nestError(403, 'Forbidden') }));
      const error = await api.client.request('/me/profile').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpError);
      expect(api.session.getSnapshot().status).toBe('authenticated');
    });

    it('does not refresh when a public request gets 401 (for example, a wrong password)', async () => {
      const { api, requests } = await setup(() => ({
        status: 401,
        body: nestError(401, 'Email or password is incorrect.'),
      }));
      const error = await api.client
        .request('/auth/sign-in', { method: 'POST', body: {}, auth: false })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({ status: 401, messages: ['Email or password is incorrect.'] });
      expect(requests).toHaveLength(1);
      expect(api.session.getSnapshot().status).toBe('authenticated');
    });

    it('copes with an error body that is not JSON', async () => {
      const { api } = await setup(() => ({ status: 502, body: undefined }));
      await expect(api.client.request('/me/profile')).rejects.toMatchObject({
        kind: 'http',
        status: 502,
        messages: [],
      });
    });
  });

  describe('secrets', () => {
    it('keeps tokens out of error messages and serialized errors', async () => {
      const { api } = await setup(
        server({
          valid: [],
          refresh: () => ({ status: 401, body: nestError(401, 'Sign in again to continue.') }),
        }),
      );
      const error = await api.client.request('/me/profile').catch((e: unknown) => e);
      const text = `${String(error)} ${JSON.stringify(error)} ${(error as Error).message}`;
      expect(text).not.toMatch(/access-token|refresh-token/);
    });
  });

  describe('configuration', () => {
    it('rejects requests with a clear error when the base URL is not configured', async () => {
      const { api, fetch } = await setup(server(), {
        baseUrl: () => {
          throw new ConfigurationError('Set EXPO_PUBLIC_API_URL.');
        },
      });
      await expect(api.client.request('/me/profile')).rejects.toBeInstanceOf(ConfigurationError);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
