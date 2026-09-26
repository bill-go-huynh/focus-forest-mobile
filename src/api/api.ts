import { createAuth } from './auth';
import { createApiClient } from './client';
import { createHttp } from './http';
import { sessionSchema, SessionStore } from './session';
import type { TokenStore } from './token-store';

export interface CreateApiOptions {
  baseUrl: string | (() => string);
  fetch: typeof globalThis.fetch;
  store: TokenStore;
  now?: () => number;
  timeoutMs?: number;
}

/** Wires the HTTP layer, the session, the client, and auth together. */
export function createApi({
  baseUrl,
  fetch,
  store,
  now = Date.now,
  timeoutMs = 15_000,
}: CreateApiOptions) {
  const send = createHttp({ baseUrl, fetch, timeoutMs });
  const session = new SessionStore({
    store,
    now,
    refreshTokens: (refreshToken) =>
      send(
        '/auth/refresh',
        { method: 'POST', body: { refreshToken }, schema: sessionSchema },
        null,
      ),
  });
  const client = createApiClient({ send, session });
  const auth = createAuth({ client, session });
  return { session, client, auth };
}

export type Api = ReturnType<typeof createApi>;
