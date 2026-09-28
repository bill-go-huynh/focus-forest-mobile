/** The part of AsyncStorage the app's stores use, so tests can pass a device storage of their own. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** A technical storage problem worth reporting. Never carries the stored value. */
export interface StorageIssue {
  code:
    | 'corrupt_json'
    | 'unsupported_version'
    | 'invalid_state'
    | 'read_failed'
    | 'write_failed'
    | 'quarantine_failed';
}

export type ParsedValue<T> =
  { ok: true; value: T } | { ok: false; reason: 'unsupported_version' | 'invalid_state' };

/**
 * `missing`: nothing stored. `corrupt`: something was stored that cannot be trusted; it was
 * moved aside and removed. `unavailable`: the storage could not be read, so nothing may be
 * written over what may be there.
 */
export type StoredRead<T> =
  { kind: 'ok'; value: T } | { kind: 'missing' } | { kind: 'corrupt' } | { kind: 'unavailable' };

/** Where one copy of an entry that could not be read is kept, for later investigation. */
export const quarantineKeyOf = (key: string) => `${key}/quarantine`;

/**
 * Reads and validates a JSON entry from untrusted device storage. An entry that is not JSON or
 * that `parse` refuses is copied to its quarantine key and removed, so the next launch starts
 * cleanly instead of failing the same way. Issues are reported by code only.
 */
export async function readStoredJson<T>(
  storage: KeyValueStorage,
  key: string,
  parse: (value: unknown) => ParsedValue<T>,
  report: (issue: StorageIssue) => void,
  {
    removeOnlyIfKept = false,
  }: {
    /**
     * For data that exists nowhere else (unsynced user input): remove the entry only once its
     * copy is kept. Otherwise it stays, and the read answers `unavailable`.
     */
    removeOnlyIfKept?: boolean;
  } = {},
): Promise<StoredRead<T>> {
  let raw: string | null;
  try {
    raw = await storage.getItem(key);
  } catch {
    report({ code: 'read_failed' });
    return { kind: 'unavailable' };
  }
  if (raw === null) return { kind: 'missing' };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return quarantine(storage, key, raw, 'corrupt_json', report, removeOnlyIfKept);
  }
  const parsed = parse(value);
  if (!parsed.ok) return quarantine(storage, key, raw, parsed.reason, report, removeOnlyIfKept);
  return { kind: 'ok', value: parsed.value };
}

async function quarantine(
  storage: KeyValueStorage,
  key: string,
  raw: string,
  code: StorageIssue['code'],
  report: (issue: StorageIssue) => void,
  removeOnlyIfKept: boolean,
): Promise<{ kind: 'corrupt' } | { kind: 'unavailable' }> {
  report({ code });
  try {
    await storage.setItem(quarantineKeyOf(key), raw);
  } catch {
    report({ code: 'quarantine_failed' });
    if (removeOnlyIfKept) return { kind: 'unavailable' };
  }
  await storage.removeItem(key).catch(() => undefined);
  return { kind: 'corrupt' };
}
