import type { KeyValueStorage } from '../common/stored-json';

/**
 * A device's key-value storage (AsyncStorage) that outlives app instances: create stores over
 * the same one to simulate a kill and relaunch. Each method can be made to fail.
 */
export function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  const failing: {
    setItem: boolean;
    getItem: boolean;
    removeItem: boolean;
    /** Fails writes to the matching keys only. */
    setItemFor?: (key: string) => boolean;
  } = { setItem: false, getItem: false, removeItem: false };
  const storage: KeyValueStorage & { data: Map<string, string>; failing: typeof failing } = {
    data,
    failing,
    getItem: jest.fn(async (key: string) => {
      if (failing.getItem) throw new Error('read failed');
      return data.get(key) ?? null;
    }),
    setItem: jest.fn(async (key: string, value: string) => {
      if (failing.setItem || failing.setItemFor?.(key)) throw new Error('write failed');
      data.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      if (failing.removeItem) throw new Error('remove failed');
      data.delete(key);
    }),
  };
  return storage;
}
