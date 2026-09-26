import type { ApiClient } from './client';
import { ApiError } from './errors';
import { sessionSchema, type SessionStatus, type SessionStore, type SessionUser } from './session';

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Sign up, sign in, restore, and sign out, for M11. They use the A3 endpoints only.
 * The API has no sign-out endpoint, so signing out clears the session on this device.
 */
export function createAuth({ client, session }: { client: ApiClient; session: SessionStore }) {
  async function start(path: '/auth/sign-up' | '/auth/sign-in', credentials: Credentials) {
    const result = await client.request(path, {
      method: 'POST',
      body: credentials,
      auth: false,
      schema: sessionSchema,
    });
    await session.setSession(result);
    return result.user;
  }

  return {
    signUp: (credentials: Credentials): Promise<SessionUser> => start('/auth/sign-up', credentials),
    signIn: (credentials: Credentials): Promise<SessionUser> => start('/auth/sign-in', credentials),

    /**
     * Reads the saved session and renews an expired access token. Offline, the user stays
     * signed in; the next request refreshes. A rejected refresh token signs out.
     */
    async restoreSession(): Promise<SessionStatus> {
      const status = await session.restore();
      if (status === 'authenticated' && session.isAccessTokenExpired()) {
        try {
          await session.refresh();
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
        }
      }
      return session.getSnapshot().status;
    },

    signOut: (): Promise<void> => session.clear(),
  };
}

export type Auth = ReturnType<typeof createAuth>;
