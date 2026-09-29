import { quarantineKeyOf, type StorageIssue } from '../../common/stored-json';
import { makeHistoryItem } from '../../test-utils/history';
import { memoryStorage } from '../../test-utils/storage';
import {
  HISTORY_SNAPSHOT_MAX,
  historySnapshotKey,
  HistorySnapshotStore,
} from '../history-snapshot-store';

const ADA = '11111111-1111-4111-8111-111111111111';
const BEA = '22222222-2222-4222-8222-222222222222';
const idOf = (n: number) => `0192f1a2-3b4c-7d5e-8f60-${String(n).padStart(12, '0')}`;

function launch(storage = memoryStorage()) {
  const issues: StorageIssue[] = [];
  const store = new HistorySnapshotStore({ storage, report: (issue) => issues.push(issue) });
  return { store, storage, issues };
}

describe('HistorySnapshotStore', () => {
  it('keeps the last loaded history, in server order, through a kill and relaunch', async () => {
    const first = launch();
    await first.store.activate(ADA);
    const items = [makeHistoryItem({ id: idOf(2) }), makeHistoryItem({ id: idOf(1) })];

    expect(await first.store.save(ADA, items, 1_000)).toBe(true);

    const relaunched = launch(first.storage);
    const snapshot = await relaunched.store.activate(ADA);
    expect(snapshot).toMatchObject({ status: 'ready', userId: ADA, savedAt: 1_000, items });
  });

  it(`keeps at most the newest ${HISTORY_SNAPSHOT_MAX} sessions`, async () => {
    const app = launch();
    await app.store.activate(ADA);
    const items = Array.from({ length: 130 }, (_, i) => makeHistoryItem({ id: idOf(i + 1) }));

    await app.store.save(ADA, items, 1_000);

    const kept = app.store.getSnapshot().items;
    expect(kept).toHaveLength(HISTORY_SNAPSHOT_MAX);
    expect(kept[0]?.id).toBe(idOf(1));
  });

  it("never shows one user's history to another; sign-out keeps it", async () => {
    const app = launch();
    await app.store.activate(ADA);
    await app.store.save(ADA, [makeHistoryItem()], 1_000);

    app.store.deactivate();
    expect(app.store.getSnapshot().items).toEqual([]);
    await app.store.activate(BEA);
    expect(app.store.getSnapshot().items).toEqual([]);
    expect(await app.store.save(ADA, [makeHistoryItem()], 2_000)).toBe(false);

    await app.store.activate(ADA);
    expect(app.store.getSnapshot().items).toHaveLength(1);
  });

  it('moves a corrupt snapshot aside, then starts empty', async () => {
    const raw = JSON.stringify({ version: 1, savedAt: 1, items: [{ id: 'x' }] });
    const storage = memoryStorage({ [historySnapshotKey(ADA)]: raw });
    const app = launch(storage);

    const snapshot = await app.store.activate(ADA);

    expect(snapshot).toMatchObject({ status: 'ready', items: [], savedAt: null });
    expect(storage.data.get(quarantineKeyOf(historySnapshotKey(ADA)))).toBe(raw);
    expect(storage.data.has(historySnapshotKey(ADA))).toBe(false);
  });

  it('answers false when the write fails, keeping what it had', async () => {
    const app = launch();
    await app.store.activate(ADA);
    await app.store.save(ADA, [makeHistoryItem({ id: idOf(1) })], 1_000);
    app.storage.failing.setItem = true;

    expect(await app.store.save(ADA, [makeHistoryItem({ id: idOf(2) })], 2_000)).toBe(false);
    expect(app.store.getSnapshot().items.map((item) => item.id)).toEqual([idOf(1)]);
  });
});
