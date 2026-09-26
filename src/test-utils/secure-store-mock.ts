/**
 * An in-memory expo-secure-store for route tests. Use it with
 * `jest.mock('expo-secure-store', () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock)`
 * and `signInForTest()` to start the app signed in.
 */
const values = new Map<string, string>();

export const secureStoreMock = {
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: async (key: string) => values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    values.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    values.delete(key);
  },
};

/** Saves a valid session, as if the user had signed in earlier. */
export function signInForTest() {
  const day = 86_400_000;
  values.clear();
  values.set(
    'focus-forest.session',
    JSON.stringify({
      accessToken: 'test-access',
      accessTokenExpiresAt: new Date(Date.now() + day).toISOString(),
      refreshToken: 'test-refresh',
      refreshTokenExpiresAt: new Date(Date.now() + 30 * day).toISOString(),
      user: { id: 'user-1', email: 'mai@example.com' },
    }),
  );
}
