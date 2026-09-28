import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiProvider, createApi, createQueryClient, NetworkError } from '../../api';
import type { Topic } from '../../api/topics';
import {
  fakeFetch,
  makeSession,
  memoryTokenStore,
  NOW,
  type FakeRequest,
} from '../../test-utils/api';
import { memoryStorage } from '../../test-utils/storage';
import { makeTopic } from '../../test-utils/topics';
import { topicsQueryKey, useArchiveTopic } from '../queries';
import { TopicCacheProvider } from '../TopicCacheProvider';
import {
  createTopicCreateQueue,
  TopicCreateQueueProvider,
  usePickerTopics,
} from '../topic-create-sync';
import { topicSnapshotKey, TopicSnapshotStore } from '../topic-snapshot-store';

const ADA = { id: '11111111-1111-4111-8111-111111111111', email: 'ada@example.com' };
const NEW_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const piano = makeTopic({ id: '6e2d4a6f-3b5c-4d7e-9f80-0b1c2d3e4f50', name: 'Piano' });
const reading = { name: 'Reading', icon: 'book', color: 'topic.1' };

type Reply = { status: number; body?: unknown } | Error;

/**
 * A server with A2.2 create semantics: the first PUT of an id creates (201), the same payload
 * again replays (200), another payload is `topic_id_conflict`. POST …/archive archives. `loseNextAnswer` makes the next
 * create happen on the server while the client only sees a network failure.
 */
function topicServer(initial: Topic[]) {
  const topics = [...initial];
  const payloads = new Map<string, string>();
  const state = { loseNextAnswer: false, malformed: false, listsDown: false };
  const handler = ({ url, method, body }: FakeRequest): Reply => {
    const { pathname, searchParams } = new URL(url);
    const id = pathname.split('/')[3] ?? '';
    if (method === 'GET') {
      if (state.listsDown) return new NetworkError();
      const status = searchParams.get('status');
      return { status: 200, body: topics.filter((t) => !status || t.status === status) };
    }
    if (method === 'POST' && pathname.endsWith('/archive')) {
      const index = topics.findIndex((t) => t.id === id);
      const current = topics[index];
      if (!current) return { status: 404, body: { statusCode: 404, message: 'Topic not found.' } };
      const archived: Topic = {
        ...current,
        status: 'archived',
        archivedAt: '2026-09-27T11:00:00.000Z',
      };
      topics[index] = archived;
      return { status: 200, body: archived };
    }
    const payload = JSON.stringify(body);
    const earlier = payloads.get(id);
    if (earlier !== undefined && earlier !== payload) {
      return { status: 409, body: { statusCode: 409, message: 'x', code: 'topic_id_conflict' } };
    }
    let topic = topics.find((t) => t.id === id);
    const created = !topic;
    if (!topic) {
      topic = makeTopic({ id, ...(body as object), lastUsedAt: null, lastPlannedMinutes: null });
      topics.push(topic);
      payloads.set(id, payload);
    }
    if (state.loseNextAnswer) {
      state.loseNextAnswer = false;
      return new NetworkError();
    }
    if (state.malformed) return { status: 201, body: { ...topic, color: 'green' } };
    return { status: created ? 201 : 200, body: topic };
  };
  return { handler, state, topics };
}

async function launch(
  handler: (request: FakeRequest) => Reply | Promise<Reply>,
  storage = memoryStorage(),
  user = ADA,
) {
  const net = fakeFetch(handler);
  const api = createApi({
    baseUrl: 'https://api.example.com',
    fetch: net.fetch,
    store: memoryTokenStore(makeSession({ user })),
    now: () => NOW,
  });
  const queryClient = createQueryClient();
  // Merged, not replaced: the test setup's gcTime keeps no timer alive after the test.
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
  const snapshots = new TopicSnapshotStore({ storage, report: () => undefined });
  let n = 0;
  const queue = createTopicCreateQueue({
    storage,
    client: api.client,
    queryClient,
    snapshots,
    createId: () => (n++ === 0 ? NEW_ID : `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`),
    report: () => undefined,
  });
  await api.session.restore();
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider api={api} queryClient={queryClient}>
        <TopicCacheProvider store={snapshots}>
          <TopicCreateQueueProvider queue={queue}>{children}</TopicCreateQueueProvider>
        </TopicCacheProvider>
      </ApiProvider>
    );
  }
  return { api, queryClient, snapshots, queue, storage, wrapper, requests: net.requests };
}

const puts = (requests: FakeRequest[]) => requests.filter((r) => r.method === 'PUT');
const savedRecent = (storage: ReturnType<typeof memoryStorage>) =>
  (JSON.parse(storage.data.get(topicSnapshotKey(ADA.id)) ?? '{"lists":{}}').lists['active:recent']
    ?.topics ?? []) as Topic[];

describe('offline topic creation, synced later', () => {
  it('shows a topic created offline next to the known ones, and never saves it as confirmed', async () => {
    const server = topicServer([piano]);
    const first = await launch(server.handler);
    const { result } = renderHook(() => usePickerTopics(), { wrapper: first.wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    const offline = await launch(() => new NetworkError(), first.storage);
    const picker = renderHook(() => usePickerTopics(), { wrapper: offline.wrapper });
    await waitFor(() => expect(picker.result.current.items).toHaveLength(1));

    await act(async () => {
      await offline.queue.enqueue(reading);
    });

    await waitFor(() =>
      expect(picker.result.current.items).toEqual([
        { kind: 'confirmed', topic: piano },
        expect.objectContaining({ kind: 'pending', id: NEW_ID, name: 'Reading' }),
      ]),
    );
    expect(savedRecent(offline.storage).map((t) => t.id)).toEqual([piano.id]);
    expect(offline.queue.isTopicSynced(NEW_ID)).toBe(false);
  });

  it('syncs after a restart: confirmed in the cache and on the device, then leaves the queue', async () => {
    const storage = memoryStorage();
    const offline = await launch(() => new NetworkError(), storage);
    renderHook(() => usePickerTopics(), { wrapper: offline.wrapper });
    await waitFor(() => expect(offline.queue.getSnapshot().status).toBe('ready'));
    await act(async () => {
      await offline.queue.enqueue(reading);
    });

    const server = topicServer([piano]);
    const online = await launch(server.handler, storage);
    const picker = renderHook(() => usePickerTopics(), { wrapper: online.wrapper });

    await waitFor(() => expect(online.queue.isTopicSynced(NEW_ID)).toBe(true));
    await waitFor(() =>
      expect(picker.result.current.items.map((item) => item.kind)).toEqual([
        'confirmed',
        'confirmed',
      ]),
    );
    expect(savedRecent(storage).map((t) => t.id)).toContain(NEW_ID);
    expect(server.topics.filter((t) => t.id === NEW_ID)).toHaveLength(1);
  });

  it('recovers a create whose answer was lost: the same payload again, a replay, no duplicate', async () => {
    const server = topicServer([piano]);
    server.state.loseNextAnswer = true;
    const app = await launch(server.handler);
    renderHook(() => usePickerTopics(), { wrapper: app.wrapper });
    await waitFor(() => expect(app.queue.getSnapshot().status).toBe('ready'));

    await act(async () => {
      await app.queue.enqueue({ ...reading, description: '  Novels ' });
    });
    await waitFor(() => expect(puts(app.requests)).toHaveLength(1));
    expect(app.queue.isTopicSynced(NEW_ID)).toBe(false);

    await act(() => app.queue.flush());

    const [first, second] = puts(app.requests);
    expect(second?.body).toEqual(first?.body);
    expect(JSON.stringify(second?.body)).toBe(JSON.stringify(first?.body));
    expect(server.topics.filter((t) => t.id === NEW_ID)).toHaveLength(1);
    expect(app.queue.isTopicSynced(NEW_ID)).toBe(true);
    expect(
      app.queryClient
        .getQueryData<Topic[]>(topicsQueryKey({ status: 'active', sort: 'recent' }))
        ?.some((t) => t.id === NEW_ID),
    ).toBe(true);
  });

  it('keeps the create when the answer breaks the contract', async () => {
    const server = topicServer([piano]);
    server.state.malformed = true;
    const app = await launch(server.handler);
    renderHook(() => usePickerTopics(), { wrapper: app.wrapper });
    await waitFor(() => expect(app.queue.getSnapshot().status).toBe('ready'));

    await act(async () => {
      await app.queue.enqueue(reading);
    });
    await waitFor(() => expect(app.queue.getSnapshot().items[0]?.state).toBe('needs_attention'));

    expect(app.queue.isTopicSynced(NEW_ID)).toBe(false);
    expect(savedRecent(app.storage).map((t) => t.id)).not.toContain(NEW_ID);
  });

  it('keeps the create when the confirmed topic cannot be saved on the device, then replays', async () => {
    const server = topicServer([piano]);
    const app = await launch(server.handler);
    const picker = renderHook(() => usePickerTopics(), { wrapper: app.wrapper });
    await waitFor(() => expect(picker.result.current.items).toHaveLength(1));
    app.storage.failing.setItemFor = (key) => key === topicSnapshotKey(ADA.id);

    await act(async () => {
      await app.queue.enqueue(reading);
    });
    await waitFor(() => expect(puts(app.requests)).toHaveLength(1));
    await act(() => app.queue.flush());

    expect(server.topics.filter((t) => t.id === NEW_ID)).toHaveLength(1);
    expect(app.queue.isTopicSynced(NEW_ID)).toBe(false);
    expect(app.queue.getSnapshot().items).toEqual([
      expect.objectContaining({ id: NEW_ID, state: 'pending', attempted: true }),
    ]);

    app.storage.failing.setItemFor = undefined;
    await act(() => app.queue.flush());

    expect(app.queue.isTopicSynced(NEW_ID)).toBe(true);
    expect(savedRecent(app.storage).map((t) => t.id)).toContain(NEW_ID);
    const [first, ...replays] = puts(app.requests);
    for (const replay of replays) expect(replay.body).toEqual(first?.body);
    expect(server.topics.filter((t) => t.id === NEW_ID)).toHaveLength(1);
  });
});

describe('a topic created offline before any topic list was ever fetched', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const offline = () => new NetworkError();
  const GRACE = { id: '22222222-2222-4222-8222-222222222222', email: 'grace@example.com' };

  /** Queues a create on a fresh device that never fetched a topic list, while offline. */
  async function createdOffline(storage = memoryStorage()) {
    const app = await launch(offline, storage);
    const picker = renderHook(() => usePickerTopics(), { wrapper: app.wrapper });
    await waitFor(() => expect(app.queue.getSnapshot().status).toBe('ready'));
    await act(async () => {
      await app.queue.enqueue(reading);
    });
    await waitFor(() =>
      expect(picker.result.current.items).toEqual([
        expect.objectContaining({ kind: 'pending', id: NEW_ID }),
      ]),
    );
    picker.unmount();
    return storage;
  }

  /** The create reaches the server, and every list request fails from then on. */
  async function syncedWithoutLists(storage: ReturnType<typeof memoryStorage>) {
    const server = topicServer([]);
    server.state.listsDown = true;
    const app = await launch(server.handler, storage);
    const picker = renderHook(() => usePickerTopics(), { wrapper: app.wrapper });
    await waitFor(() => expect(app.queue.isTopicSynced(NEW_ID)).toBe(true));
    const confirmed = server.topics.find((topic) => topic.id === NEW_ID);
    picker.unmount();
    return { server, app, confirmed };
  }

  it('is still in the picker after a kill and an offline relaunch, confirmed', async () => {
    const storage = await createdOffline();
    const { confirmed } = await syncedWithoutLists(storage);

    // A new process: new query client, snapshot store, queue, and providers.
    const relaunched = await launch(offline, storage);
    const picker = renderHook(() => usePickerTopics(), { wrapper: relaunched.wrapper });

    await waitFor(() =>
      expect(picker.result.current.items).toEqual([{ kind: 'confirmed', topic: confirmed }]),
    );
    expect(relaunched.queue.getSnapshot().items).toEqual([]);
    expect(relaunched.queue.isTopicSynced(NEW_ID)).toBe(true);
  });

  it('keeps every server field from the create answer', async () => {
    const storage = await createdOffline();
    const { confirmed } = await syncedWithoutLists(storage);

    const relaunched = await launch(offline, storage);
    const picker = renderHook(() => usePickerTopics(), { wrapper: relaunched.wrapper });

    await waitFor(() => expect(picker.result.current.items).toHaveLength(1));
    const [item] = picker.result.current.items;
    expect(item?.kind === 'confirmed' ? item.topic : null).toStrictEqual(confirmed);
  });

  it('stays queued when the confirmed topic cannot be stored, then replays the same payload', async () => {
    const storage = await createdOffline();
    storage.failing.setItemFor = (key) => key === topicSnapshotKey(ADA.id);
    const server = topicServer([]);
    server.state.listsDown = true;
    const app = await launch(server.handler, storage);
    renderHook(() => usePickerTopics(), { wrapper: app.wrapper });
    await waitFor(() => expect(puts(app.requests)).toHaveLength(1));
    await act(() => app.queue.flush());

    expect(app.queue.getSnapshot().items).toEqual([
      expect.objectContaining({ id: NEW_ID, state: 'pending', attempted: true }),
    ]);
    expect(app.queue.isTopicSynced(NEW_ID)).toBe(false);

    storage.failing.setItemFor = undefined;
    await act(() => app.queue.flush());

    expect(app.queue.isTopicSynced(NEW_ID)).toBe(true);
    const [first, ...replays] = puts(app.requests);
    expect(replays.length).toBeGreaterThan(0);
    for (const replay of replays) expect(replay.body).toEqual(first?.body);
    expect(server.topics.filter((topic) => topic.id === NEW_ID)).toHaveLength(1);
  });

  it('shows once, in the server order, when the picker list is fetched again', async () => {
    const storage = await createdOffline();
    const { server } = await syncedWithoutLists(storage);
    server.state.listsDown = false;
    server.topics.unshift(piano);

    const online = await launch(server.handler, storage);
    const picker = renderHook(() => usePickerTopics(), { wrapper: online.wrapper });

    await waitFor(() =>
      expect(
        picker.result.current.items.map((item) =>
          item.kind === 'confirmed' ? item.topic.id : item.id,
        ),
      ).toEqual([piano.id, NEW_ID]),
    );
    expect(picker.result.current.items.every((item) => item.kind === 'confirmed')).toBe(true);
    await waitFor(() => expect(online.snapshots.getSnapshot().unlisted).toEqual({}));
  });

  it('shows a topic once when the saved snapshot has it both in the list and aside', async () => {
    const created = makeTopic({
      id: NEW_ID,
      name: 'Reading',
      lastUsedAt: null,
      lastPlannedMinutes: null,
    });
    const storage = memoryStorage({
      [topicSnapshotKey(ADA.id)]: JSON.stringify({
        version: 1,
        lists: { 'active:recent': { savedAt: 1, topics: [piano, created] } },
        unlisted: { [NEW_ID]: { confirmedAt: 2, topic: created } },
      }),
    });

    const app = await launch(offline, storage);
    const picker = renderHook(() => usePickerTopics(), { wrapper: app.wrapper });

    await waitFor(() =>
      expect(picker.result.current.items).toEqual([
        { kind: 'confirmed', topic: piano },
        { kind: 'confirmed', topic: created },
      ]),
    );
  });

  it('is never shown to another user on the device', async () => {
    const storage = await createdOffline();
    await syncedWithoutLists(storage);

    const grace = await launch(offline, storage, GRACE);
    const picker = renderHook(() => usePickerTopics(), { wrapper: grace.wrapper });

    await waitFor(() => expect(grace.queue.getSnapshot().status).toBe('ready'));
    await waitFor(() => expect(picker.result.current.recent.isError).toBe(true));
    expect(picker.result.current.items).toEqual([]);
  });

  it('keeps it when the only list answer after the create was asked for before it', async () => {
    const storage = await createdOffline();
    let clock = Date.parse('2026-09-27T12:00:00.000Z');
    jest.spyOn(Date, 'now').mockImplementation(() => (clock += 1000));
    const server = topicServer([piano]);
    // The list request is read on the server first; the create lands only after it.
    const lists: (() => void)[] = [];
    let listAsked: () => void = () => undefined;
    const firstListAsked = new Promise<void>((resolve) => {
      listAsked = resolve;
    });
    const handler = (request: FakeRequest): Reply | Promise<Reply> => {
      if (request.method !== 'GET') return firstListAsked.then(() => server.handler(request));
      const answer = server.handler(request);
      listAsked();
      return new Promise<Reply>((resolve) => lists.push(() => resolve(answer)));
    };
    const app = await launch(handler, storage);
    renderHook(() => usePickerTopics(), { wrapper: app.wrapper });
    await waitFor(() => expect(lists).toHaveLength(1));
    await waitFor(() => expect(app.queue.isTopicSynced(NEW_ID)).toBe(true));

    // Only the early request answers (the later one never does): its list lacks the topic.
    await act(async () => {
      lists[0]?.();
    });

    await waitFor(() =>
      expect(app.snapshots.getSnapshot().lists['active:recent']?.topics.map((t) => t.id)).toEqual([
        piano.id,
      ]),
    );
    expect(Object.keys(app.snapshots.getSnapshot().unlisted)).toEqual([NEW_ID]);
    for (const release of lists.slice(1)) release();
  });

  it('shows it once when a picker list asked for before the create already has it', async () => {
    const storage = await createdOffline();
    const server = topicServer([piano]);
    const pendingLists: (() => void)[] = [];
    const handler = (request: FakeRequest): Reply | Promise<Reply> => {
      if (request.method !== 'GET') return server.handler(request);
      // Asked for before the create is confirmed, read on the server after it.
      return new Promise<Reply>((resolve) => {
        pendingLists.push(() => resolve(server.handler(request)));
      });
    };
    const app = await launch(handler, storage);
    const picker = renderHook(() => usePickerTopics(), { wrapper: app.wrapper });
    await waitFor(() => expect(pendingLists.length).toBeGreaterThan(0));
    await waitFor(() => expect(app.queue.isTopicSynced(NEW_ID)).toBe(true));

    await act(async () => {
      for (const release of pendingLists.splice(0)) release();
    });
    await waitFor(() => expect(picker.result.current.recent.isSuccess).toBe(true));

    const ids = picker.result.current.items.map((item) =>
      item.kind === 'confirmed' ? item.topic.id : item.id,
    );
    expect(ids.filter((id) => id === NEW_ID)).toHaveLength(1);
  });

  it('follows an archive answered for it, even with no saved list, across a relaunch', async () => {
    const storage = await createdOffline();
    const { server } = await syncedWithoutLists(storage);

    const app = await launch(server.handler, storage);
    const view = renderHook(() => ({ picker: usePickerTopics(), archive: useArchiveTopic() }), {
      wrapper: app.wrapper,
    });
    await waitFor(() => expect(view.result.current.picker.items).toHaveLength(1));
    await act(async () => {
      await view.result.current.archive.mutateAsync(NEW_ID);
    });

    await waitFor(() => expect(view.result.current.picker.items).toEqual([]));
    view.unmount();
    const relaunched = await launch(offline, storage);
    const picker = renderHook(() => usePickerTopics(), { wrapper: relaunched.wrapper });
    await waitFor(() => expect(relaunched.queue.getSnapshot().status).toBe('ready'));
    await waitFor(() => expect(picker.result.current.recent.isError).toBe(true));
    expect(picker.result.current.items).toEqual([]);
  });
});
