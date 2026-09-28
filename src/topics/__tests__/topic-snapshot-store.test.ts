import type { StorageIssue } from '../../common/stored-json';
import { memoryStorage } from '../../test-utils/storage';
import { makeTopic } from '../../test-utils/topics';
import { topicSnapshotKey, TopicSnapshotStore } from '../topic-snapshot-store';

const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '22222222-2222-4222-8222-222222222222';
const RECENT = { status: 'active', sort: 'recent' } as const;
const SAVED_AT = Date.parse('2026-09-27T10:00:00.000Z');

function launch(storage = memoryStorage()) {
  const issues: StorageIssue[] = [];
  const store = new TopicSnapshotStore({ storage, report: (issue) => issues.push(issue) });
  return { store, storage, issues };
}

const reading = makeTopic();
const piano = makeTopic({ id: '6e2d4a6f-3b5c-4d7e-9f80-0b1c2d3e4f50', name: 'Piano' });

describe('TopicSnapshotStore', () => {
  it('has no topics for a user it has never seen', async () => {
    const { store } = launch();
    const snapshot = await store.activate(ADA);
    expect(snapshot).toEqual({ status: 'ready', userId: ADA, lists: {}, unlisted: {} });
  });

  it('keeps a saved list across a relaunch, with the time the server confirmed it', async () => {
    const first = launch();
    await first.store.activate(ADA);
    await first.store.save(ADA, RECENT, [piano, reading], SAVED_AT);

    const next = launch(first.storage);
    const snapshot = await next.store.activate(ADA);

    expect(snapshot.lists['active:recent']).toEqual({
      savedAt: SAVED_AT,
      topics: [piano, reading],
    });
  });

  it('keeps each list the server answered, in its own order', async () => {
    const first = launch();
    await first.store.activate(ADA);
    await first.store.save(ADA, RECENT, [piano, reading], SAVED_AT);
    await first.store.save(ADA, {}, [reading, piano], SAVED_AT + 1);

    const snapshot = await launch(first.storage).store.activate(ADA);

    expect(snapshot.lists['active:recent']?.topics).toEqual([piano, reading]);
    expect(snapshot.lists['all:created']?.topics).toEqual([reading, piano]);
  });

  it('replaces a list with the latest answer', async () => {
    const { store, storage } = launch();
    await store.activate(ADA);
    await store.save(ADA, RECENT, [reading], SAVED_AT);
    await store.save(ADA, RECENT, [piano], SAVED_AT + 60_000);

    const snapshot = await launch(storage).store.activate(ADA);
    expect(snapshot.lists['active:recent']).toEqual({
      savedAt: SAVED_AT + 60_000,
      topics: [piano],
    });
  });

  it('never replaces a list with an answer to an older request', async () => {
    const { store, storage } = launch();
    await store.activate(ADA);
    await store.save(ADA, RECENT, [piano, reading], SAVED_AT + 60_000);

    await expect(store.save(ADA, RECENT, [reading], SAVED_AT)).resolves.toBe(true);

    const snapshot = await launch(storage).store.activate(ADA);
    expect(snapshot.lists['active:recent']).toEqual({
      savedAt: SAVED_AT + 60_000,
      topics: [piano, reading],
    });
  });

  it('keeps users apart, and sign-out keeps what was saved', async () => {
    const { store, storage } = launch();
    await store.activate(ADA);
    await store.save(ADA, RECENT, [reading], SAVED_AT);
    store.deactivate();

    expect(store.getSnapshot()).toEqual({
      status: 'inactive',
      userId: null,
      lists: {},
      unlisted: {},
    });
    expect((await store.activate(GRACE)).lists).toEqual({});
    await store.save(GRACE, RECENT, [piano], SAVED_AT);
    store.deactivate();
    expect((await store.activate(ADA)).lists['active:recent']?.topics).toEqual([reading]);
    expect(storage.data.has(topicSnapshotKey(ADA))).toBe(true);
    expect(storage.data.has(topicSnapshotKey(GRACE))).toBe(true);
  });

  it("never saves one user's answer for another who is now signed in", async () => {
    const { store, storage } = launch();
    await store.activate(GRACE);

    await store.save(ADA, RECENT, [reading], SAVED_AT);

    expect(storage.data.has(topicSnapshotKey(ADA))).toBe(false);
    expect(storage.data.has(topicSnapshotKey(GRACE))).toBe(false);
    expect(store.getSnapshot().lists).toEqual({});
  });

  it('tells lists read from the device apart from answers of this launch', async () => {
    const first = launch();
    await first.store.activate(ADA);
    await first.store.save(ADA, RECENT, [reading], SAVED_AT);
    expect(first.store.isFromDevice(first.store.getSnapshot().lists['active:recent']!.topics)).toBe(
      false,
    );

    const next = launch(first.storage);
    const { lists } = await next.store.activate(ADA);

    expect(next.store.isFromDevice(lists['active:recent']!.topics)).toBe(true);
    expect(next.store.isFromDevice([reading])).toBe(false);
  });

  it('reports a failed write, keeps the list in memory, and does not throw', async () => {
    const { store, storage, issues } = launch();
    await store.activate(ADA);
    storage.failing.setItem = true;

    await expect(store.save(ADA, RECENT, [reading], SAVED_AT)).resolves.toBe(false);

    expect(store.getSnapshot().lists['active:recent']?.topics).toEqual([reading]);
    expect(issues).toEqual([{ code: 'write_failed' }]);
  });

  it('reads as unavailable when storage cannot be read, and saves nothing over it', async () => {
    const first = launch();
    await first.store.activate(ADA);
    await first.store.save(ADA, RECENT, [reading], SAVED_AT);
    const stored = first.storage.data.get(topicSnapshotKey(ADA));
    first.storage.failing.getItem = true;

    const next = launch(first.storage);
    const snapshot = await next.store.activate(ADA);
    await next.store.save(ADA, {}, [piano], SAVED_AT);

    expect(snapshot).toEqual({ status: 'unavailable', userId: ADA, lists: {}, unlisted: {} });
    expect(first.storage.data.get(topicSnapshotKey(ADA))).toBe(stored);
  });

  describe('confirmed topics no saved list has yet', () => {
    const created = makeTopic({
      id: 'aaaaaaaa-0000-4000-8000-00000000000a',
      name: 'Chess',
      lastUsedAt: null,
      lastPlannedMinutes: null,
    });

    it('keeps a created topic across a relaunch, exactly as the server answered it', async () => {
      const first = launch();
      await first.store.activate(ADA);

      await expect(first.store.rememberUnlisted(ADA, created, SAVED_AT)).resolves.toBe(true);

      const { unlisted } = await launch(first.storage).store.activate(ADA);
      expect(unlisted).toEqual({ [created.id]: { confirmedAt: SAVED_AT, topic: created } });
    });

    it('lets go of it once the picker list has it, whenever that list was asked for', async () => {
      const { store, storage } = launch();
      await store.activate(ADA);
      await store.rememberUnlisted(ADA, created, SAVED_AT);

      await store.save(ADA, RECENT, [reading, created], SAVED_AT - 1);

      expect(store.getSnapshot().unlisted).toEqual({});
      expect((await launch(storage).store.activate(ADA)).unlisted).toEqual({});
    });

    it('lets go of it when a picker list asked for later does not have it (no longer active)', async () => {
      const { store } = launch();
      await store.activate(ADA);
      await store.rememberUnlisted(ADA, created, SAVED_AT);

      await store.save(ADA, RECENT, [reading], SAVED_AT);
      expect(Object.keys(store.getSnapshot().unlisted)).toEqual([created.id]);

      await store.save(ADA, RECENT, [reading], SAVED_AT + 1);
      expect(store.getSnapshot().unlisted).toEqual({});
    });

    it('keeps it while the picker list is older, or when another list is saved', async () => {
      const { store } = launch();
      await store.activate(ADA);
      await store.rememberUnlisted(ADA, created, SAVED_AT);

      await store.save(ADA, RECENT, [reading], SAVED_AT - 1);
      await store.save(ADA, {}, [reading, created], SAVED_AT + 1);

      expect(Object.keys(store.getSnapshot().unlisted)).toEqual([created.id]);
    });

    it('is never kept for a user who is not signed in', async () => {
      const { store, storage } = launch();
      await store.activate(GRACE);

      await expect(store.rememberUnlisted(ADA, created, SAVED_AT)).resolves.toBe(false);

      expect(store.getSnapshot().unlisted).toEqual({});
      expect(storage.data.has(topicSnapshotKey(ADA))).toBe(false);
      store.deactivate();
      expect((await store.activate(ADA)).unlisted).toEqual({});
    });

    it('reports a failed write and answers false', async () => {
      const { store, storage, issues } = launch();
      await store.activate(ADA);
      storage.failing.setItem = true;

      await expect(store.rememberUnlisted(ADA, created, SAVED_AT)).resolves.toBe(false);
      expect(issues).toEqual([{ code: 'write_failed' }]);
    });

    it('drops a snapshot whose unlisted topic breaks the contract', async () => {
      const raw = JSON.stringify({
        version: 1,
        lists: {},
        unlisted: { [created.id]: { confirmedAt: SAVED_AT, topic: { ...created, color: 'x' } } },
      });
      const storage = memoryStorage({ [topicSnapshotKey(ADA)]: raw });
      const { store, issues } = launch(storage);

      expect((await store.activate(ADA)).unlisted).toEqual({});
      expect(issues).toEqual([{ code: 'invalid_state' }]);
    });

    it('drops a snapshot whose unlisted key is not the topic id', async () => {
      const raw = JSON.stringify({
        version: 1,
        lists: {},
        unlisted: { [reading.id]: { confirmedAt: SAVED_AT, topic: created } },
      });
      const storage = memoryStorage({ [topicSnapshotKey(ADA)]: raw });
      const { store, issues } = launch(storage);

      expect((await store.activate(ADA)).unlisted).toEqual({});
      expect(issues).toEqual([{ code: 'invalid_state' }]);
    });
  });

  describe('a stored snapshot it cannot trust', () => {
    const valid = () =>
      JSON.stringify({
        version: 1,
        lists: { 'active:recent': { savedAt: SAVED_AT, topics: [reading] } },
      });

    it.each([
      ['malformed JSON', valid().slice(0, -2), 'corrupt_json'],
      ['another version', valid().replace('"version":1', '"version":2'), 'unsupported_version'],
      ['a topic with a bad color', valid().replace('topic.1', 'green'), 'invalid_state'],
      [
        'a topic with an uppercase id',
        valid().replace(reading.id, reading.id.toUpperCase()),
        'invalid_state',
      ],
      ['an unknown list', valid().replace('active:recent', 'deleted:recent'), 'invalid_state'],
      [
        'a fractional save time',
        valid().replace(String(SAVED_AT), `${SAVED_AT}.5`),
        'invalid_state',
      ],
      [
        'a list that is not a list',
        valid().replace('[{', '{"0":{').replace('}]', '}}'),
        'invalid_state',
      ],
    ])('drops %s without exposing any topic', async (_case, raw, code) => {
      const storage = memoryStorage({ [topicSnapshotKey(ADA)]: raw });
      const { store, issues } = launch(storage);

      const snapshot = await store.activate(ADA);

      expect(snapshot).toEqual({ status: 'ready', userId: ADA, lists: {}, unlisted: {} });
      expect(storage.data.has(topicSnapshotKey(ADA))).toBe(false);
      expect(issues).toEqual([{ code }]);
    });

    it('never reports the stored topics', async () => {
      const storage = memoryStorage({ [topicSnapshotKey(ADA)]: '{"private name"' });
      const { store, issues } = launch(storage);
      await store.activate(ADA);
      expect(JSON.stringify(issues)).not.toContain('private name');
    });
  });
});
