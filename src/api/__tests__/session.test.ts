import { makeSession, memoryTokenStore, nestError, NOW } from '../../test-utils/api';
import { HttpError, NetworkError, UnauthenticatedError } from '../errors';
import { SessionStore, type Session } from '../session';

function setup(initial: Session | null = null) {
  const store = memoryTokenStore(initial);
  const refreshTokens = jest.fn<Promise<Session>, [string]>(async () => makeSession({}, 2));
  const session = new SessionStore({ store, refreshTokens, now: () => NOW });
  return { store, refreshTokens, session };
}

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('SessionStore', () => {
  describe('restore', () => {
    it('starts unknown, until the saved session is read', () => {
      expect(setup().session.getSnapshot().status).toBe('unknown');
    });

    it('is unauthenticated when nothing is saved', async () => {
      const { session } = setup();
      await expect(session.restore()).resolves.toBe('unauthenticated');
      expect(session.getSnapshot()).toEqual({ status: 'unauthenticated', user: null });
    });

    it('is authenticated with a saved session, without a network call', async () => {
      const { session, refreshTokens } = setup(makeSession());
      await expect(session.restore()).resolves.toBe('authenticated');
      expect(session.getSnapshot()).toEqual({
        status: 'authenticated',
        user: { id: 'user-1', email: 'mai@example.com' },
      });
      expect(refreshTokens).not.toHaveBeenCalled();
    });

    it('treats unreadable secure storage as signed out, instead of staying unknown', async () => {
      const { session, store } = setup();
      jest.mocked(store.load).mockRejectedValueOnce(new Error('Keychain unavailable'));
      jest.mocked(store.clear).mockRejectedValueOnce(new Error('Keychain unavailable'));
      await expect(session.restore()).resolves.toBe('unauthenticated');
      expect(session.getSnapshot().status).toBe('unauthenticated');
    });

    it('drops a saved session whose refresh token has expired', async () => {
      const expired = makeSession({ refreshTokenExpiresAt: new Date(NOW - 1).toISOString() });
      const { session, store } = setup(expired);
      await expect(session.restore()).resolves.toBe('unauthenticated');
      expect(store.current()).toBeNull();
    });
  });

  describe('changes', () => {
    it('saves a new session and tells subscribers', async () => {
      const { session, store } = setup();
      const listener = jest.fn();
      session.subscribe(listener);

      await session.setSession(makeSession());

      expect(store.current()).toEqual(makeSession());
      expect(session.getSnapshot().status).toBe('authenticated');
      expect(listener).toHaveBeenCalled();
    });

    it('clears the session from storage and memory, and tells subscribers', async () => {
      const { session, store } = setup(makeSession());
      await session.restore();
      const listener = jest.fn();
      session.subscribe(listener);

      await session.clear();

      expect(store.current()).toBeNull();
      expect(session.getAccessToken()).toBeNull();
      expect(session.getSnapshot()).toEqual({ status: 'unauthenticated', user: null });
      expect(listener).toHaveBeenCalled();
    });

    it('stops telling a listener once it unsubscribes', async () => {
      const { session } = setup();
      const listener = jest.fn();
      const unsubscribe = session.subscribe(listener);
      unsubscribe();
      await session.setSession(makeSession());
      expect(listener).not.toHaveBeenCalled();
    });

    it('keeps the same snapshot object while nothing changes (for useSyncExternalStore)', async () => {
      const { session } = setup(makeSession());
      await session.restore();
      expect(session.getSnapshot()).toBe(session.getSnapshot());
    });
  });

  describe('access token expiry', () => {
    it('treats the access token as expired a little before its expiry time', async () => {
      const { session } = setup(
        makeSession({ accessTokenExpiresAt: new Date(NOW + 10_000).toISOString() }),
      );
      await session.restore();
      expect(session.isAccessTokenExpired()).toBe(true);
    });

    it('treats a fresh access token as valid', async () => {
      const { session } = setup(makeSession());
      await session.restore();
      expect(session.isAccessTokenExpired()).toBe(false);
    });
  });

  describe('refresh (A3: each refresh token works once; a replay ends the sign-in)', () => {
    it('exchanges the refresh token for a new pair and saves it', async () => {
      const { session, store, refreshTokens } = setup(makeSession());
      await session.restore();

      await expect(session.refresh()).resolves.toEqual(makeSession({}, 2));

      expect(refreshTokens).toHaveBeenCalledWith('refresh-token-1');
      expect(store.current()).toEqual(makeSession({}, 2));
      expect(session.getAccessToken()).toBe('access-token-2');
    });

    it('runs only one refresh for concurrent callers, so the token is never replayed', async () => {
      const { session, refreshTokens } = setup(makeSession());
      await session.restore();
      const pending = deferred<Session>();
      refreshTokens.mockReturnValueOnce(pending.promise);

      const results = [session.refresh(), session.refresh(), session.refresh()];
      pending.resolve(makeSession({}, 2));

      await expect(Promise.all(results)).resolves.toEqual([
        makeSession({}, 2),
        makeSession({}, 2),
        makeSession({}, 2),
      ]);
      expect(refreshTokens).toHaveBeenCalledTimes(1);
    });

    it('starts a new refresh once the previous one has finished', async () => {
      const { session, refreshTokens } = setup(makeSession());
      await session.restore();
      await session.refresh();
      refreshTokens.mockResolvedValueOnce(makeSession({}, 3));
      await session.refresh();
      expect(refreshTokens).toHaveBeenNthCalledWith(2, 'refresh-token-2');
    });

    it.each([
      ['401', new HttpError(401, nestError(401, 'Sign in again to continue.'))],
      ['400', new HttpError(400, nestError(400, ['refreshToken should not be empty']))],
    ])(
      'ends the session when the server rejects the refresh token (%s)',
      async (_status, error) => {
        const { session, store, refreshTokens } = setup(makeSession());
        await session.restore();
        refreshTokens.mockRejectedValueOnce(error);

        await expect(session.refresh()).rejects.toBeInstanceOf(UnauthenticatedError);

        expect(store.current()).toBeNull();
        expect(session.getSnapshot().status).toBe('unauthenticated');
      },
    );

    it('keeps the session when the refresh fails for lack of network', async () => {
      const { session, store, refreshTokens } = setup(makeSession());
      await session.restore();
      refreshTokens.mockRejectedValueOnce(new NetworkError('offline'));

      await expect(session.refresh()).rejects.toBeInstanceOf(NetworkError);

      expect(store.current()).toEqual(makeSession());
      expect(session.getSnapshot().status).toBe('authenticated');
    });

    it('keeps the session when the server has a problem of its own (5xx)', async () => {
      const { session, refreshTokens } = setup(makeSession());
      await session.restore();
      refreshTokens.mockRejectedValueOnce(new HttpError(503, undefined));

      await expect(session.refresh()).rejects.toBeInstanceOf(HttpError);
      expect(session.getSnapshot().status).toBe('authenticated');
    });

    it('refuses to refresh without a session, and makes no call', async () => {
      const { session, refreshTokens } = setup();
      await session.restore();
      await expect(session.refresh()).rejects.toBeInstanceOf(UnauthenticatedError);
      expect(refreshTokens).not.toHaveBeenCalled();
    });

    it('does not bring a session back when it was cleared during a refresh', async () => {
      const { session, store, refreshTokens } = setup(makeSession());
      await session.restore();
      const pending = deferred<Session>();
      refreshTokens.mockReturnValueOnce(pending.promise);

      const refreshing = session.refresh();
      await session.clear();
      pending.resolve(makeSession({}, 2));

      await expect(refreshing).rejects.toBeInstanceOf(UnauthenticatedError);
      expect(store.current()).toBeNull();
      expect(session.getSnapshot().status).toBe('unauthenticated');
    });
  });
});
