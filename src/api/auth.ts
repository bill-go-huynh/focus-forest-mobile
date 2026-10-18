import { z } from 'zod';

import { forgetGoogleAccount } from '../auth/google';
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
     * W.2 Signs in with the ID token Google gave the app. A new Google account is created by the
     * server, with its Google name and this device's time zone (`created`: it onboards).
     */
    async signInWithGoogle(
      idToken: string,
      timezone: string | null,
    ): Promise<{ user: SessionUser; created: boolean }> {
      const { created, ...result } = await client.request('/auth/google', {
        method: 'POST',
        body: { idToken, ...(timezone ? { timezone } : {}) },
        auth: false,
        schema: googleSessionSchema,
      });
      await session.setSession(result);
      return { user: result.user, created };
    },

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

    /** W.3 Asks the API to email a reset code. It answers the same whether the email has an account. */
    async requestPasswordReset(email: string): Promise<void> {
      await client.request('/auth/password-reset/request', {
        method: 'POST',
        body: { email },
        auth: false,
      });
    },

    /** W.3 The emailed code sets a new password; the API signs this device in. */
    async resetPassword(reset: { email: string; code: string; password: string }) {
      const result = await client.request('/auth/password-reset/confirm', {
        method: 'POST',
        body: reset,
        auth: false,
        schema: sessionSchema,
      });
      await session.setSession(result);
      return result.user;
    },

    /** Also forgets the Google account on this device, so the next sign-in can pick another. */
    async signOut(): Promise<void> {
      await session.clear();
      await forgetGoogleAccount();
    },
  };
}

const googleSessionSchema = sessionSchema.extend({ created: z.boolean() });

export type Auth = ReturnType<typeof createAuth>;
