import { createQueryClient } from '../../api';
import { memoryStorage } from '../../test-utils/storage';
import { makeTopic } from '../../test-utils/topics';
import { applyServerTopic, topicsQueryKey } from '../queries';
import { TopicSnapshotStore } from '../topic-snapshot-store';

const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '22222222-2222-4222-8222-222222222222';
const RECENT = { status: 'active', sort: 'recent' } as const;

describe('applyServerTopic', () => {
  it("never puts one user's late answer in the next user's cache or snapshot", async () => {
    const queryClient = createQueryClient();
    const store = new TopicSnapshotStore({ storage: memoryStorage(), report: () => undefined });
    await store.activate(GRACE);
    const graces = [makeTopic({ name: 'Chess' })];
    queryClient.setQueryData(topicsQueryKey(RECENT), graces);
    await store.save(GRACE, RECENT, graces, 1);
    const adasTopic = makeTopic({ id: 'aaaaaaaa-0000-4000-8000-00000000000a', name: 'Reading' });

    const stored = await applyServerTopic(queryClient, store, ADA, adasTopic, { created: true });

    expect(stored).toBe(false);
    expect(queryClient.getQueryData(topicsQueryKey(RECENT))).toBe(graces);
    expect(store.getSnapshot().lists['active:recent']?.topics).toEqual(graces);
  });

  it('adds a created topic to the signed-in user’s lists, cached and saved', async () => {
    const queryClient = createQueryClient();
    const store = new TopicSnapshotStore({ storage: memoryStorage(), report: () => undefined });
    await store.activate(ADA);
    const known = makeTopic({ name: 'Chess' });
    queryClient.setQueryData(topicsQueryKey(RECENT), [known]);
    // A list saved on the device but not in the cache (no screen asked for it yet).
    await store.save(ADA, {}, [known], 1);
    const created = makeTopic({ id: 'aaaaaaaa-0000-4000-8000-00000000000a', name: 'Reading' });

    const stored = await applyServerTopic(queryClient, store, ADA, created, { created: true });

    expect(stored).toBe(true);
    expect(queryClient.getQueryData(topicsQueryKey(RECENT))).toEqual([known, created]);
    expect(store.getSnapshot().lists['all:created']?.topics).toEqual([known, created]);
  });
});
