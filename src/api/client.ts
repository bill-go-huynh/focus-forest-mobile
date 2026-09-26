import { HttpError, UnauthenticatedError } from './errors';
import type { RequestOptions, Send } from './http';
import type { SessionStore } from './session';

export type { RequestOptions } from './http';

/**
 * The app's API client. Authenticated requests carry the access token. An expired token is
 * refreshed before sending; a 401 triggers at most one refresh and one retry. Concurrent
 * requests share the refresh. If the session cannot be renewed it is cleared, and the
 * request fails with UnauthenticatedError.
 */
export function createApiClient({ send, session }: { send: Send; session: SessionStore }) {
  async function request<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
    if (options.auth === false) return send(path, options, null);

    if (session.isAccessTokenExpired()) await session.refresh();
    const token = session.getAccessToken();
    if (!token) throw new UnauthenticatedError();

    try {
      return await send(path, options, token);
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 401)) throw error;
    }

    // Another request may already have refreshed while this one was in flight.
    const current = session.getAccessToken();
    const retryToken =
      current && current !== token ? current : (await session.refresh()).accessToken;

    try {
      return await send(path, options, retryToken);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        // Still rejected with a fresh token: the sign-in is no longer valid.
        await session.clear();
        throw new UnauthenticatedError();
      }
      throw error;
    }
  }

  return { request };
}

export type ApiClient = ReturnType<typeof createApiClient>;
