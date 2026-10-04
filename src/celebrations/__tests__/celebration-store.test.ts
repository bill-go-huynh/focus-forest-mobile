import { quarantineKeyOf, type StorageIssue } from '../../common/stored-json';
import { CLOSED_MONTH_GROWTH, makeGrowth } from '../../test-utils/core-loop';
import { makeSessionResult } from '../../test-utils/sessions';
import { memoryStorage } from '../../test-utils/storage';
import {
  celebrationsKey,
  CelebrationStore,
  GOALS_CELEBRATED_MAX,
  isCelebratable,
} from '../celebration-store';

const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '22222222-2222-4222-8222-222222222222';
const S1 = '0192f1a2-3b4c-7d5e-8f60-000000000001';
const S2 = '0192f1a2-3b4c-7d5e-8f60-000000000002';
const S3 = '0192f1a2-3b4c-7d5e-8f60-000000000003';

type Storage = ReturnType<typeof memoryStorage>;

const grown = (id: string, startedAt = '2026-10-07T09:00:00.000Z', growth = makeGrowth()) =>
  makeSessionResult({ id, startedAt, growth });

function launch(storage: Storage = memoryStorage()) {
  const issues: StorageIssue[] = [];
  const store = new CelebrationStore({ storage, report: (issue) => issues.push(issue) });
  return { store, storage, issues };
}

async function ready(storage?: Storage, userId = ADA) {
  const app = launch(storage);
  await app.store.activate(userId);
  return app;
}

const stored = (storage: Storage, userId = ADA) => {
  const raw = storage.data.get(celebrationsKey(userId));
  return raw === undefined
    ? null
    : (JSON.parse(raw) as { pending: { sessionId: string }[]; consumed: string[] });
};
const pendingIds = (store: CelebrationStore) =>
  store.getSnapshot().pending.map((intent) => intent.sessionId);

describe('isCelebratable', () => {
  it('celebrates only counted growth of an open month with a tree', () => {
    expect(isCelebratable(makeGrowth())).toBe(true);
    expect(isCelebratable(null)).toBe(false);
    expect(isCelebratable(undefined)).toBe(false);
    expect(isCelebratable(CLOSED_MONTH_GROWTH)).toBe(false);
    expect(isCelebratable(makeGrowth({ counted: false }))).toBe(false);
  });
});

describe('CelebrationStore', () => {
  it('stores the server’s growth durably before it is visible', async () => {
    const { store, storage } = await ready();
    const seen: (string[] | null)[] = [];
    store.subscribe(() => seen.push(stored(storage)?.pending.map((p) => p.sessionId) ?? null));

    await expect(store.record(ADA, grown(S1))).resolves.toBe(true);

    expect(pendingIds(store)).toEqual([S1]);
    expect(store.getSnapshot().pending[0]!.growth).toEqual(makeGrowth());
    // Every change listeners saw was already on the device.
    expect(seen.at(-1)).toEqual([S1]);
  });

  it('records nothing for growth null, a closed month, or a session that does not count', async () => {
    const { store, storage } = await ready();
    for (const growth of [null, CLOSED_MONTH_GROWTH, makeGrowth({ counted: false })]) {
      await expect(store.record(ADA, makeSessionResult({ id: S1, growth }))).resolves.toBe(true);
    }
    const { growth: _none, ...noteAnswer } = makeSessionResult({ id: S2 });
    await expect(store.record(ADA, noteAnswer)).resolves.toBe(true);
    expect(pendingIds(store)).toEqual([]);
    expect(stored(storage)).toBeNull();
  });

  it('records a replayed answer once', async () => {
    const { store, storage } = await ready();
    await store.record(ADA, grown(S1));
    await store.record(ADA, grown(S1));
    expect(pendingIds(store)).toEqual([S1]);
    expect(stored(storage)?.pending).toHaveLength(1);
  });

  it('never brings back a consumed celebration, even for a late replay', async () => {
    const { store, storage } = await ready();
    await store.record(ADA, grown(S1));
    await expect(store.consume(ADA, [S1])).resolves.toBe(true);
    await store.record(ADA, grown(S1));
    expect(pendingIds(store)).toEqual([]);

    const relaunched = await ready(storage);
    await relaunched.store.record(ADA, grown(S1));
    expect(pendingIds(relaunched.store)).toEqual([]);
  });

  it('keeps pending celebrations in session order through a restart', async () => {
    const { store, storage } = await ready();
    await store.record(ADA, grown(S3, '2026-10-07T12:00:00.000Z'));
    await store.record(ADA, grown(S1, '2026-10-07T08:00:00.000Z'));
    await store.record(ADA, grown(S2, '2026-10-07T10:00:00.000Z'));
    expect(pendingIds(store)).toEqual([S1, S2, S3]);

    const relaunched = await ready(storage);
    expect(pendingIds(relaunched.store)).toEqual([S1, S2, S3]);
  });

  it('consumes durably: a consumed celebration is gone after a restart', async () => {
    const { store, storage } = await ready();
    await store.record(ADA, grown(S1));
    await store.record(ADA, grown(S2, '2026-10-07T10:00:00.000Z'));
    await store.consume(ADA, [S1]);
    expect(pendingIds(store)).toEqual([S2]);
    const relaunched = await ready(storage);
    expect(pendingIds(relaunched.store)).toEqual([S2]);
  });

  it('answers false and shows nothing when the device cannot store it', async () => {
    const { store, storage, issues } = await ready();
    storage.failing.setItem = true;
    await expect(store.record(ADA, grown(S1))).resolves.toBe(false);
    expect(pendingIds(store)).toEqual([]);
    expect(issues).toEqual([{ code: 'write_failed' }]);
  });

  it('keeps a celebration when its consumption cannot be stored', async () => {
    const { store, storage } = await ready();
    await store.record(ADA, grown(S1));
    storage.failing.setItem = true;
    await expect(store.consume(ADA, [S1])).resolves.toBe(false);
    expect(pendingIds(store)).toEqual([S1]);
  });

  it('waits for the read before recording, so nothing stored is overwritten', async () => {
    const storage = memoryStorage();
    const first = await ready(storage);
    await first.store.record(ADA, grown(S1));

    const { store } = launch(storage);
    const activating = store.activate(ADA);
    const recording = store.record(ADA, grown(S2, '2026-10-07T10:00:00.000Z'));
    await activating;
    await expect(recording).resolves.toBe(true);
    expect(pendingIds(store)).toEqual([S1, S2]);
  });

  it('keeps each user’s celebrations apart', async () => {
    const storage = memoryStorage();
    const { store } = await ready(storage, ADA);
    await store.record(ADA, grown(S1));

    await store.activate(GRACE);
    expect(pendingIds(store)).toEqual([]);
    await expect(store.record(ADA, grown(S2))).resolves.toBe(false);
    await expect(store.consume(ADA, [S1])).resolves.toBe(false);
    expect(stored(storage, GRACE)).toBeNull();

    store.deactivate();
    expect(store.getSnapshot()).toMatchObject({ status: 'inactive', userId: null, pending: [] });
    await store.activate(ADA);
    expect(pendingIds(store)).toEqual([S1]);
  });

  it('holds a celebration for the screen showing it, in memory only', async () => {
    const { store, storage } = await ready();
    await store.record(ADA, grown(S1));
    store.hold(S1);
    expect(store.getSnapshot().held).toEqual([S1]);
    store.release(S1);
    expect(store.getSnapshot().held).toEqual([]);
    expect(JSON.stringify(stored(storage))).not.toContain('held');
  });

  it.each([
    ['not JSON', '{oops'],
    [
      'an invalid document',
      JSON.stringify({ version: 1, pending: [{ sessionId: 'x' }], consumed: [] }),
    ],
    ['another version', JSON.stringify({ version: 9 })],
  ])('sets aside %s and starts empty', async (_case, raw) => {
    const storage = memoryStorage({ [celebrationsKey(ADA)]: raw });
    const { store, issues } = await ready(storage);
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', pending: [] });
    expect(storage.data.get(quarantineKeyOf(celebrationsKey(ADA)))).toBe(raw);
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('CelebrationStore: today’s goal reached, celebrated once (M3.3)', () => {
  const DAY = '2026-10-07';

  it('marks a day’s goal celebrated durably before it shows, once', async () => {
    const { store, storage } = await ready();
    expect(store.getSnapshot().goalsCelebrated).toEqual([]);
    await expect(store.celebrateGoal(ADA, DAY)).resolves.toBe(true);
    expect(store.getSnapshot().goalsCelebrated).toEqual([DAY]);
    expect(JSON.parse(storage.data.get(celebrationsKey(ADA))!).goalsCelebrated).toEqual([DAY]);
    await expect(store.celebrateGoal(ADA, DAY)).resolves.toBe(true);
    expect(store.getSnapshot().goalsCelebrated).toEqual([DAY]);
  });

  it('remembers it across a restart, per user, alongside waiting growth', async () => {
    const storage = memoryStorage();
    const first = await ready(storage);
    await first.store.record(ADA, grown(S1));
    await first.store.celebrateGoal(ADA, DAY);

    const again = await ready(storage);
    expect(again.store.getSnapshot().goalsCelebrated).toEqual([DAY]);
    expect(pendingIds(again.store)).toEqual([S1]);
    const grace = await ready(storage, GRACE);
    expect(grace.store.getSnapshot().goalsCelebrated).toEqual([]);
  });

  it('reads a document saved before goals were celebrated', async () => {
    const storage = memoryStorage();
    storage.data.set(
      celebrationsKey(ADA),
      JSON.stringify({ version: 1, pending: [], consumed: [] }),
    );
    const { store, issues } = await ready(storage);
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', goalsCelebrated: [] });
    expect(issues).toEqual([]);
  });

  it('answers false when it cannot be stored, so the goal is not marked', async () => {
    const storage = memoryStorage();
    const { store } = await ready(storage);
    storage.failing.setItem = true;
    await expect(store.celebrateGoal(ADA, DAY)).resolves.toBe(false);
    expect(store.getSnapshot().goalsCelebrated).toEqual([]);
  });

  it('keeps a bounded number of days', async () => {
    const { store } = await ready();
    for (let day = 1; day <= GOALS_CELEBRATED_MAX + 5; day += 1) {
      await store.celebrateGoal(
        ADA,
        `2026-${String(Math.ceil(day / 28)).padStart(2, '0')}-${String(((day - 1) % 28) + 1).padStart(2, '0')}`,
      );
    }
    expect(store.getSnapshot().goalsCelebrated).toHaveLength(GOALS_CELEBRATED_MAX);
  });
});
