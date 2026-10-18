import AsyncStorage from '@react-native-async-storage/async-storage';

import type { KeyValueStorage } from '../common/stored-json';

/**
 * Whether this device has shown the welcome for good (W.1): set once an account has signed in
 * here. Until then a signed-out launch opens the welcome; after it, sign in. It is per device,
 * not per account, and holds nothing about anyone.
 */
export const WELCOME_KEY = 'focus-forest/welcome/v1';

const DONE = JSON.stringify({ version: 1, status: 'done' });

/** False when nothing is stored, when it cannot be read, or when it is not understood. */
export async function readWelcomeDone(storage: KeyValueStorage = AsyncStorage): Promise<boolean> {
  try {
    const raw = await storage.getItem(WELCOME_KEY);
    if (raw === null) return false;
    const value = JSON.parse(raw) as { version?: unknown; status?: unknown } | null;
    return value?.version === 1 && value.status === 'done';
  } catch {
    return false;
  }
}

/** Best effort: if it cannot be stored, the welcome shows again next time, which is harmless. */
export async function markWelcomeDone(storage: KeyValueStorage = AsyncStorage): Promise<void> {
  try {
    await storage.setItem(WELCOME_KEY, DONE);
  } catch {
    // Nothing to do: see above.
  }
}
