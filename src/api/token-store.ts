import * as SecureStore from 'expo-secure-store';

import { sessionSchema, type Session } from './session';

/**
 * Where the session (access and refresh tokens) is kept. The app uses secure device
 * storage (Keychain on iOS, Keystore-backed storage on Android), never AsyncStorage.
 */
export interface TokenStore {
  load(): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(): Promise<void>;
}

export const SESSION_KEY = 'focus-forest.session';

// Readable after the first unlock, so a refresh can run in the background, and never
// synced or restored to another device.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const secureTokenStore: TokenStore = {
  async load() {
    const raw = await SecureStore.getItemAsync(SESSION_KEY, OPTIONS);
    if (raw === null) return null;
    try {
      const parsed = sessionSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // Unreadable: fall through and clear it.
    }
    await SecureStore.deleteItemAsync(SESSION_KEY, OPTIONS);
    return null;
  },
  async save(session) {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), OPTIONS);
  },
  async clear() {
    await SecureStore.deleteItemAsync(SESSION_KEY, OPTIONS);
  },
};
