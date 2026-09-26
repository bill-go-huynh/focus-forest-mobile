import { z } from 'zod';

import { HttpError, UnauthenticatedError } from './errors';
import type { TokenStore } from './token-store';

/** The API's AuthResult (A3: POST /auth/sign-up, /auth/sign-in, /auth/refresh). */
export const sessionSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.iso.datetime(),
  refreshToken: z.string().min(1),
  refreshTokenExpiresAt: z.iso.datetime(),
  user: z.object({ id: z.string().min(1), email: z.string().min(1) }),
});
export type Session = z.infer<typeof sessionSchema>;
export type SessionUser = Session['user'];

export type SessionStatus = 'unknown' | 'authenticated' | 'unauthenticated';
export interface SessionSnapshot {
  status: SessionStatus;
  user: SessionUser | null;
}

/** Refresh a little early, so a token does not expire on its way to the server. */
const EXPIRY_MARGIN_MS = 30_000;

interface SessionStoreOptions {
  store: TokenStore;
  /** Exchanges a refresh token for a new session (POST /auth/refresh). */
  refreshTokens: (refreshToken: string) => Promise<Session>;
  now: () => number;
}

/**
 * The signed-in session: kept in memory, persisted through the TokenStore, observable for
 * React (useSyncExternalStore). Refresh is single-flight: concurrent callers share one
 * request, because A3 refresh tokens work once and a replay ends the whole sign-in.
 */
export class SessionStore {
  private session: Session | null = null;
  private snapshot: SessionSnapshot = { status: 'unknown', user: null };
  private listeners = new Set<() => void>();
  private refreshing: Promise<Session> | null = null;
  // Bumped on every clear, so a refresh that finishes after sign-out is discarded.
  private generation = 0;

  constructor(private readonly options: SessionStoreOptions) {}

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getAccessToken(): string | null {
    return this.session?.accessToken ?? null;
  }

  isAccessTokenExpired(): boolean {
    if (!this.session) return false;
    return Date.parse(this.session.accessTokenExpiresAt) - EXPIRY_MARGIN_MS <= this.options.now();
  }

  /** Reads the saved session. A refresh token that has already expired is dropped. */
  async restore(): Promise<SessionStatus> {
    let saved: Session | null = null;
    try {
      saved = await this.options.store.load();
    } catch {
      // Unreadable storage counts as signed out, so the app never waits forever.
      await this.options.store.clear().catch(() => undefined);
    }
    if (saved && Date.parse(saved.refreshTokenExpiresAt) > this.options.now()) {
      this.set(saved);
    } else {
      if (saved) await this.options.store.clear().catch(() => undefined);
      this.set(null);
    }
    return this.snapshot.status;
  }

  async setSession(session: Session): Promise<void> {
    await this.options.store.save(session);
    this.set(session);
  }

  async clear(): Promise<void> {
    this.generation += 1;
    this.refreshing = null;
    await this.options.store.clear();
    this.set(null);
  }

  refresh(): Promise<Session> {
    this.refreshing ??= this.runRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async runRefresh(): Promise<Session> {
    const current = this.session;
    if (!current) throw new UnauthenticatedError();
    const generation = this.generation;
    try {
      const next = await this.options.refreshTokens(current.refreshToken);
      if (generation !== this.generation) throw new UnauthenticatedError();
      await this.setSession(next);
      return next;
    } catch (error) {
      // The server rejected the refresh token: the sign-in is over. Network and server
      // failures keep the session, so the user is not signed out for being offline.
      const rejected =
        error instanceof UnauthenticatedError ||
        (error instanceof HttpError && (error.status === 401 || error.status === 400));
      if (rejected) {
        if (generation === this.generation) await this.clear();
        throw error instanceof UnauthenticatedError ? error : new UnauthenticatedError();
      }
      throw error;
    }
  }

  private set(session: Session | null): void {
    this.session = session;
    this.snapshot = session
      ? { status: 'authenticated', user: session.user }
      : { status: 'unauthenticated', user: null };
    for (const listener of this.listeners) listener();
  }
}
