import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { makeSession } from '../../test-utils/api';
import { SESSION_KEY, secureTokenStore } from '../token-store';

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  setItemAsync: jest.fn(async () => undefined),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { setItem: jest.fn(), getItem: jest.fn(), removeItem: jest.fn() },
}));

const secure = jest.mocked(SecureStore);
const OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

beforeEach(() => jest.clearAllMocks());

describe('secureTokenStore (docs/08 §3: tokens in secure device storage)', () => {
  it('saves the session in secure storage, kept on this device only', async () => {
    const session = makeSession();
    await secureTokenStore.save(session);
    expect(secure.setItemAsync).toHaveBeenCalledWith(SESSION_KEY, JSON.stringify(session), OPTIONS);
  });

  it('loads a saved session', async () => {
    const session = makeSession();
    secure.getItemAsync.mockResolvedValueOnce(JSON.stringify(session));
    await expect(secureTokenStore.load()).resolves.toEqual(session);
    expect(secure.getItemAsync).toHaveBeenCalledWith(SESSION_KEY, OPTIONS);
  });

  it('returns null when nothing is saved', async () => {
    await expect(secureTokenStore.load()).resolves.toBeNull();
  });

  it.each(['not json', JSON.stringify({ accessToken: 'only-this' }), JSON.stringify(null)])(
    'clears an unreadable or incomplete entry instead of using it (%p)',
    async (raw) => {
      secure.getItemAsync.mockResolvedValueOnce(raw);
      await expect(secureTokenStore.load()).resolves.toBeNull();
      expect(secure.deleteItemAsync).toHaveBeenCalledWith(SESSION_KEY, OPTIONS);
    },
  );

  it('clears the session', async () => {
    await secureTokenStore.clear();
    expect(secure.deleteItemAsync).toHaveBeenCalledWith(SESSION_KEY, OPTIONS);
  });

  it('never uses AsyncStorage, which is not encrypted', async () => {
    secure.getItemAsync.mockResolvedValueOnce(JSON.stringify(makeSession()));
    await secureTokenStore.save(makeSession());
    await secureTokenStore.load();
    await secureTokenStore.clear();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });
});
