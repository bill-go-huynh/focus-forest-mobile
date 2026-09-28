import { quarantineKeyOf, readStoredJson, type StorageIssue } from '../stored-json';
import { memoryStorage } from '../../test-utils/storage';

const KEY = 'focus-forest/example/v1/user-1';

type Parsed = { ok: true; value: { n: number } } | { ok: false; reason: 'invalid_state' };
const parse = (value: unknown): Parsed =>
  typeof value === 'object' && value !== null && typeof (value as { n?: unknown }).n === 'number'
    ? { ok: true, value: value as { n: number } }
    : { ok: false, reason: 'invalid_state' };

function setup(initial?: string) {
  const storage = memoryStorage();
  if (initial !== undefined) storage.data.set(KEY, initial);
  const issues: StorageIssue[] = [];
  const read = () => readStoredJson(storage, KEY, parse, (issue) => issues.push(issue));
  return { storage, issues, read };
}

describe('readStoredJson', () => {
  it('reports nothing stored as missing', async () => {
    const { read, issues } = setup();
    await expect(read()).resolves.toEqual({ kind: 'missing' });
    expect(issues).toEqual([]);
  });

  it('returns a value the parser accepts, and leaves it in place', async () => {
    const { read, storage } = setup('{"n":1}');
    await expect(read()).resolves.toEqual({ kind: 'ok', value: { n: 1 } });
    expect(storage.data.get(KEY)).toBe('{"n":1}');
  });

  it.each([
    ['text that is not JSON', '{"n":', 'corrupt_json'],
    ['JSON the parser refuses', '{"n":"one"}', 'invalid_state'],
  ])('moves %s aside, removes it, and reports only its code', async (_case, raw, code) => {
    const { read, storage, issues } = setup(raw);

    await expect(read()).resolves.toEqual({ kind: 'corrupt' });

    expect(storage.data.has(KEY)).toBe(false);
    expect(storage.data.get(quarantineKeyOf(KEY))).toBe(raw);
    expect(issues).toEqual([{ code }]);
  });

  it('still removes the entry when the copy cannot be kept', async () => {
    const { read, storage, issues } = setup('not json');
    storage.failing.setItem = true;

    await expect(read()).resolves.toEqual({ kind: 'corrupt' });

    expect(storage.data.has(KEY)).toBe(false);
    expect(issues).toEqual([{ code: 'corrupt_json' }, { code: 'quarantine_failed' }]);
  });

  it('can keep the entry when no copy could be kept, for data that exists nowhere else', async () => {
    const storage = memoryStorage({ [KEY]: 'not json' });
    storage.failing.setItem = true;

    const read = await readStoredJson(storage, KEY, parse, () => undefined, {
      removeOnlyIfKept: true,
    });

    expect(read).toEqual({ kind: 'unavailable' });
    expect(storage.data.get(KEY)).toBe('not json');
  });

  it('reports a storage that cannot be read as unavailable, and touches nothing', async () => {
    const { read, storage, issues } = setup('{"n":1}');
    storage.failing.getItem = true;

    await expect(read()).resolves.toEqual({ kind: 'unavailable' });

    expect(storage.data.get(KEY)).toBe('{"n":1}');
    expect(issues).toEqual([{ code: 'read_failed' }]);
  });
});
