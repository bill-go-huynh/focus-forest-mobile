import { quarantineKeyOf, type StorageIssue } from '../../common/stored-json';
import { makeHome } from '../../test-utils/core-loop';
import { memoryStorage } from '../../test-utils/storage';
import { homeSnapshotKey, HomeSnapshotStore } from '../home-snapshot-store';

const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '22222222-2222-4222-8222-222222222222';
const T = Date.parse('2026-10-07T18:00:00.000Z');

function launch(storage = memoryStorage()) {
  const issues: StorageIssue[] = [];
  return {
    store: new HomeSnapshotStore({ storage, report: (i) => issues.push(i) }),
    storage,
    issues,
  };
}

describe('HomeSnapshotStore', () => {
  it('saves the last Home the server answered, per user, across restarts', async () => {
    const { store, storage } = launch();
    await store.activate(ADA);
    const home = makeHome();
    await expect(store.save(ADA, home, T)).resolves.toBe(true);
    expect(store.getSnapshot()).toMatchObject({ userId: ADA, savedAt: T, home });

    const relaunched = launch(storage).store;
    await relaunched.activate(ADA);
    expect(relaunched.getSnapshot()).toMatchObject({ status: 'ready', savedAt: T, home });
  });

  it('never replaces a newer saved Home with an older answer', async () => {
    const { store } = launch();
    await store.activate(ADA);
    const newer = makeHome({ today: '2026-10-08' });
    await store.save(ADA, newer, T + 1000);
    await expect(store.save(ADA, makeHome(), T)).resolves.toBe(false);
    expect(store.getSnapshot().home).toEqual(newer);
  });

  it('keeps users apart', async () => {
    const { store, storage } = launch();
    await store.activate(ADA);
    await store.save(ADA, makeHome(), T);
    await store.activate(GRACE);
    expect(store.getSnapshot()).toMatchObject({ userId: GRACE, home: null, savedAt: null });
    await expect(store.save(ADA, makeHome(), T + 5)).resolves.toBe(false);
    expect(storage.data.has(homeSnapshotKey(GRACE))).toBe(false);
    store.deactivate();
    expect(store.getSnapshot()).toMatchObject({ status: 'inactive', home: null });
  });

  it('sets aside a corrupt or invalid saved Home and starts empty', async () => {
    for (const raw of ['{oops', JSON.stringify({ version: 1, savedAt: T, home: { today: 'x' } })]) {
      const storage = memoryStorage({ [homeSnapshotKey(ADA)]: raw });
      const { store, issues } = launch(storage);
      await store.activate(ADA);
      expect(store.getSnapshot()).toMatchObject({ status: 'ready', home: null });
      expect(storage.data.get(quarantineKeyOf(homeSnapshotKey(ADA)))).toBe(raw);
      expect(issues.length).toBeGreaterThan(0);
    }
  });

  it('answers false when the device cannot store it', async () => {
    const { store, storage } = launch();
    await store.activate(ADA);
    storage.failing.setItem = true;
    await expect(store.save(ADA, makeHome(), T)).resolves.toBe(false);
    expect(store.getSnapshot().home).toBeNull();
  });
});
