import type { Session } from '../api/session';
import type { TokenStore } from '../api/token-store';

export const NOW = Date.parse('2026-09-26T10:00:00.000Z');
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** A session shaped like the API's AuthResult (POST /auth/sign-in, sign-up, refresh). */
export function makeSession(overrides: Partial<Session> = {}, n = 1): Session {
  return {
    accessToken: `access-token-${n}`,
    accessTokenExpiresAt: new Date(NOW + 15 * MINUTE).toISOString(),
    refreshToken: `refresh-token-${n}`,
    refreshTokenExpiresAt: new Date(NOW + 30 * DAY).toISOString(),
    user: { id: 'user-1', email: 'mai@example.com' },
    ...overrides,
  };
}

/** An in-memory TokenStore, standing in for secure storage. */
export function memoryTokenStore(initial: Session | null = null) {
  let stored = initial;
  const store: TokenStore & { current: () => Session | null } = {
    load: jest.fn(async () => stored),
    save: jest.fn(async (session: Session) => {
      stored = session;
    }),
    clear: jest.fn(async () => {
      stored = null;
    }),
    current: () => stored,
  };
  return store;
}

export interface FakeRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = { status: number; body?: unknown } | Error;

/**
 * A fetch stand-in at the network boundary. The handler sees each request and returns a
 * status and JSON body, or an Error to simulate a network failure.
 */
export function fakeFetch(handler: (request: FakeRequest) => Reply | Promise<Reply>) {
  const requests: FakeRequest[] = [];
  const fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const request: FakeRequest = {
      url,
      method: init.method ?? 'GET',
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    const reply = await handler(request);
    if (reply instanceof Error) throw reply;
    const text = reply.body === undefined ? '' : JSON.stringify(reply.body);
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      text: async () => text,
    } as Response;
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, requests };
}

/** A Nest error body, as the API sends it. */
export function nestError(statusCode: number, message: string | string[]) {
  return { statusCode, message, error: 'Error' };
}
