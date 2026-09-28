import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiProvider, createApi, createQueryClient, NetworkError, type Api } from '../../api';
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
import {
  topicsQueryKey,
  useArchiveTopic,
  useCreateTopic,
  useRecentTopics,
  useRestoreTopic,
  useTopics,
  useUpdateTopic,
} from '../queries';
import { TopicCacheProvider } from '../TopicCacheProvider';
import { topicSnapshotKey, TopicSnapshotStore } from '../topic-snapshot-store';

const ADA = { id: '11111111-1111-4111-8111-111111111111', email: 'ada@example.com' };
const GRACE = { id: '22222222-2222-4222-8222-222222222222', email: 'grace@example.com' };

const reading = makeTopic({ lastUsedAt: '2026-09-27T08:00:00.000Z', lastPlannedMinutes: 25 });
const piano = makeTopic({
  id: '6e2d4a6f-3b5c-4d7e-9f80-0b1c2d3e4f50',
  name: 'Piano',
  lastUsedAt: '2026-09-27T09:00:00.000Z',
  lastPlannedMinutes: 45,
});
const chess = makeTopic({
  id: '7f3e5b70-4c6d-4e8f-a091-1c2d3e4f5061',
  name: 'Chess',
  lastUsedAt: null,
  lastPlannedMinutes: null,
});

type Handler = (request: FakeRequest) => { status: number; body?: unknown } | Error;

/** A fake API server holding a user's topics, answering like A2.2/A2.8. */
function topicServer(initial: Topic[]) {
  let topics = [...initial];
  const state = { listsDown: false };
  const handler: Handler = ({ url, method, body }) => {
    const { pathname, searchParams } = new URL(url);
    const [, , , id, action] = pathname.split('/');
    if (method === 'GET') {
      if (state.listsDown) return { status: 503 };
      const status = searchParams.get('status');
      const listed = topics.filter((topic) => !status || topic.status === status);
      if (searchParams.get('sort') === 'recent') {
        listed.sort((a, b) => Date.parse(b.lastUsedAt ?? '0') - Date.parse(a.lastUsedAt ?? '0'));
      }
      return { status: 200, body: listed };
    }
    if (method === 'PUT') {
      const created = makeTopic({
        ...(body as object),
        id,
        lastUsedAt: null,
        lastPlannedMinutes: null,
      });
      topics.push(created);
      return { status: 201, body: created };
    }
    const index = topics.findIndex((topic) => topic.id === id);
    const current = topics[index];
    if (!current) return { status: 404, body: { statusCode: 404, message: 'Topic not found.' } };
    const next: Topic =
      action === 'archive'
        ? { ...current, status: 'archived', archivedAt: '2026-09-27T11:00:00.000Z' }
        : action === 'restore'
          ? { ...current, status: 'active', archivedAt: null }
          : { ...current, ...(body as object) };
    topics[index] = next;
    return { status: 200, body: next };
  };
  return {
    handler,
    set: (next: Topic[]) => {
      topics = [...next];
    },
    /** Lists fail from now on (5xx), while mutations still work. */
    failLists: () => {
      state.listsDown = true;
    },
  };
}

interface App {
  api: Api;
  store: TopicSnapshotStore;
  requests: FakeRequest[];
  wrapper: ({ children }: { children: ReactNode }) => ReactNode;
}

/** One app process: its own API, query cache, and snapshot store, over a shared device storage. */
async function launch({
  storage,
  handler,
  user = ADA,
}: {
  storage: ReturnType<typeof memoryStorage>;
  handler: Handler;
  user?: typeof ADA;
}): Promise<App> {
  const net = fakeFetch(handler);
  const api = createApi({
    baseUrl: 'https://api.example.com',
    fetch: net.fetch,
    store: memoryTokenStore(makeSession({ user })),
    now: () => NOW,
  });
  const queryClient = createQueryClient();
  // Offline answers fail at once, instead of after the app's retry delays.
  // Merged, not replaced: the test setup's gcTime keeps no timer alive after the test.
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
  const store = new TopicSnapshotStore({ storage, report: () => undefined });
  await api.session.restore();
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider api={api} queryClient={queryClient}>
        <TopicCacheProvider store={store}>{children}</TopicCacheProvider>
      </ApiProvider>
    );
  }
  return { api, store, requests: net.requests, wrapper };
}

const offline: Handler = () => new NetworkError();
const names = (topics: Topic[] | undefined) => topics?.map((topic) => topic.name);

describe('topic queries', () => {
  it('shows the recent active topics in the server’s order', async () => {
    const server = topicServer([reading, piano, chess]);
    const app = await launch({ storage: memoryStorage(), handler: server.handler });

    const { result } = renderHook(() => useRecentTopics(), { wrapper: app.wrapper });

    await waitFor(() => expect(names(result.current.data)).toEqual(['Piano', 'Reading', 'Chess']));
    expect(result.current.fromDeviceCache).toBe(false);
    expect(app.requests.at(-1)?.url).toBe(
      'https://api.example.com/me/topics?status=active&sort=recent',
    );
  });

  it('saves every successful answer for this user', async () => {
    const storage = memoryStorage();
    const app = await launch({ storage, handler: topicServer([reading, piano]).handler });

    const { result } = renderHook(() => useRecentTopics(), { wrapper: app.wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await waitFor(() => {
      const saved = JSON.parse(storage.data.get(topicSnapshotKey(ADA.id)) ?? '{}');
      expect(saved.lists['active:recent'].topics).toEqual([piano, reading]);
    });
  });
});

describe('offline after a restart', () => {
  async function syncedOnce(storage = memoryStorage()) {
    const first = await launch({ storage, handler: topicServer([reading, piano]).handler });
    const { result, unmount } = renderHook(() => useRecentTopics(), { wrapper: first.wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(storage.data.has(topicSnapshotKey(ADA.id))).toBe(true));
    unmount();
    return storage;
  }

  it('shows the topics known before the app was killed, marked as from the device', async () => {
    const storage = await syncedOnce();

    const next = await launch({ storage, handler: offline });
    const { result } = renderHook(() => useRecentTopics(), { wrapper: next.wrapper });

    await waitFor(() => expect(names(result.current.data)).toEqual(['Piano', 'Reading']));
    expect(result.current.fromDeviceCache).toBe(true);
    await waitFor(() => expect(result.current.error).toBeInstanceOf(NetworkError));
    expect(names(result.current.data)).toEqual(['Piano', 'Reading']);
    // The saved topics keep the metadata they had, for the remembered duration.
    expect(result.current.data?.[0]).toEqual(piano);
  });

  it('keeps the time the server last confirmed them, not the time they were read back', async () => {
    const storage = await syncedOnce();
    const savedAt = JSON.parse(storage.data.get(topicSnapshotKey(ADA.id))!).lists['active:recent']
      .savedAt as number;

    const next = await launch({ storage, handler: offline });
    const { result } = renderHook(() => useRecentTopics(), { wrapper: next.wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.dataUpdatedAt).toBe(savedAt);
  });

  it('replaces them, and the saved snapshot, once the server answers again', async () => {
    const storage = await syncedOnce();
    const server = topicServer([reading, piano, chess]);
    server.set([{ ...reading, name: 'Books' }, piano, chess]);

    const next = await launch({ storage, handler: server.handler });
    const { result } = renderHook(() => useRecentTopics(), { wrapper: next.wrapper });

    await waitFor(() => expect(names(result.current.data)).toEqual(['Piano', 'Books', 'Chess']));
    expect(result.current.fromDeviceCache).toBe(false);
    await waitFor(() => {
      const saved = JSON.parse(storage.data.get(topicSnapshotKey(ADA.id))!);
      expect(saved.lists['active:recent'].topics.map((t: Topic) => t.name)).toEqual([
        'Piano',
        'Books',
        'Chess',
      ]);
    });
  });

  it("never shows one user's topics to another", async () => {
    const storage = await syncedOnce();

    const next = await launch({ storage, handler: offline, user: GRACE });
    const { result } = renderHook(() => useRecentTopics(), { wrapper: next.wrapper });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NetworkError));
    expect(result.current.data).toBeUndefined();
  });

  it('keeps them through sign-out, for the same user signing in again offline', async () => {
    const storage = await syncedOnce();
    const next = await launch({ storage, handler: offline });
    const { result } = renderHook(() => useRecentTopics(), { wrapper: next.wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    await act(() => next.api.session.clear());
    await waitFor(() => expect(result.current.data).toBeUndefined());
    expect(storage.data.has(topicSnapshotKey(ADA.id))).toBe(true);

    await act(() => next.api.session.setSession(makeSession({ user: ADA })));
    await waitFor(() => expect(names(result.current.data)).toEqual(['Piano', 'Reading']));
  });

  it('shows nothing, and does not crash, when the saved snapshot is corrupt', async () => {
    const storage = memoryStorage({ [topicSnapshotKey(ADA.id)]: '{"version":1,"lists":' });

    const next = await launch({ storage, handler: offline });
    const { result } = renderHook(() => useRecentTopics(), { wrapper: next.wrapper });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(NetworkError));
    expect(result.current.data).toBeUndefined();
  });
});

describe('topic mutations keep the cached lists right', () => {
  async function withLists(topics: Topic[]) {
    const storage = memoryStorage();
    const server = topicServer(topics);
    const app = await launch({ storage, handler: server.handler });
    const lists = renderHook(
      () => ({
        all: useTopics(),
        active: useTopics({ status: 'active' }),
        archived: useTopics({ status: 'archived' }),
        recent: useRecentTopics(),
      }),
      { wrapper: app.wrapper },
    );
    await waitFor(() => {
      for (const list of Object.values(lists.result.current)) expect(list.isSuccess).toBe(true);
    });
    return { app, storage, server, lists };
  }

  function mutation<T>(app: App, hook: () => T) {
    return renderHook(hook, { wrapper: app.wrapper }).result;
  }

  it('adds a created topic to every list it belongs to', async () => {
    const { app, lists } = await withLists([reading, piano]);
    const create = mutation(app, () => useCreateTopic());

    await act(() =>
      create.current.mutateAsync({
        id: chess.id,
        fields: { name: 'Chess', icon: 'book', color: 'topic.1' },
      }),
    );

    await waitFor(() => {
      expect(names(lists.result.current.all.data)).toEqual(['Reading', 'Piano', 'Chess']);
      expect(names(lists.result.current.active.data)).toContain('Chess');
      expect(names(lists.result.current.recent.data)).toEqual(['Piano', 'Reading', 'Chess']);
    });
    expect(names(lists.result.current.archived.data)).toEqual([]);
  });

  it('replaces an edited topic everywhere, keeping its recent use', async () => {
    const { app, lists } = await withLists([reading, piano]);
    const update = mutation(app, () => useUpdateTopic());

    const saved = await act(() =>
      update.current.mutateAsync({ id: reading.id, changes: { name: 'Books' } }),
    );

    expect(saved).toMatchObject({
      name: 'Books',
      lastUsedAt: reading.lastUsedAt,
      lastPlannedMinutes: 25,
    });
    for (const list of [lists.result.current.all, lists.result.current.recent]) {
      expect(list.data?.find((topic) => topic.id === reading.id)).toEqual({
        ...reading,
        name: 'Books',
      });
    }
  });

  it('moves an archived topic out of the active lists and into the archived one, and back', async () => {
    const { app, lists } = await withLists([reading, piano]);
    const archive = mutation(app, () => useArchiveTopic());
    const restore = mutation(app, () => useRestoreTopic());

    await act(() => archive.current.mutateAsync(piano.id));

    expect(names(lists.result.current.active.data)).toEqual(['Reading']);
    expect(names(lists.result.current.recent.data)).toEqual(['Reading']);
    await waitFor(() => expect(names(lists.result.current.archived.data)).toEqual(['Piano']));
    expect(lists.result.current.all.data?.find((t) => t.id === piano.id)).toMatchObject({
      status: 'archived',
      lastUsedAt: piano.lastUsedAt,
      lastPlannedMinutes: 45,
    });

    await act(() => restore.current.mutateAsync(piano.id));

    expect(names(lists.result.current.archived.data)).toEqual([]);
    await waitFor(() =>
      expect(names(lists.result.current.recent.data)).toEqual(['Piano', 'Reading']),
    );
  });

  it('saves the lists as they are after a mutation, for an offline restart', async () => {
    const { app, storage } = await withLists([reading, piano]);
    const archive = mutation(app, () => useArchiveTopic());

    await act(() => archive.current.mutateAsync(piano.id));

    await waitFor(() => {
      const saved = JSON.parse(storage.data.get(topicSnapshotKey(ADA.id))!);
      expect(saved.lists['active:recent'].topics.map((t: Topic) => t.name)).toEqual(['Reading']);
    });
  });

  describe('from the mutation answer alone, when the lists cannot be fetched again', () => {
    it('replaces an edited topic, keeping its recent use', async () => {
      const { app, server, lists } = await withLists([reading, piano]);
      server.failLists();
      const update = mutation(app, () => useUpdateTopic());

      await act(() => update.current.mutateAsync({ id: reading.id, changes: { name: 'Books' } }));

      await waitFor(() => expect(lists.result.current.recent.isError).toBe(true));
      expect(lists.result.current.recent.data).toEqual([piano, { ...reading, name: 'Books' }]);
    });

    it('takes an archived topic out of the active lists only', async () => {
      const { app, server, lists } = await withLists([reading, piano]);
      server.failLists();
      const archive = mutation(app, () => useArchiveTopic());

      await act(() => archive.current.mutateAsync(piano.id));

      await waitFor(() => expect(lists.result.current.all.isError).toBe(true));
      expect(names(lists.result.current.active.data)).toEqual(['Reading']);
      expect(names(lists.result.current.recent.data)).toEqual(['Reading']);
      expect(lists.result.current.all.data?.map((t) => [t.name, t.status])).toEqual([
        ['Reading', 'active'],
        ['Piano', 'archived'],
      ]);
    });

    it('does not guess where a restored topic goes in a list it was not in', async () => {
      const { app, server, lists } = await withLists([
        reading,
        { ...piano, status: 'archived', archivedAt: '2026-09-27T11:00:00.000Z' },
      ]);
      server.failLists();
      const restore = mutation(app, () => useRestoreTopic());

      await act(() => restore.current.mutateAsync(piano.id));

      await waitFor(() => expect(lists.result.current.recent.isError).toBe(true));
      expect(names(lists.result.current.recent.data)).toEqual(['Reading']);
      expect(names(lists.result.current.archived.data)).toEqual([]);
    });

    it('saves the changed lists for an offline restart', async () => {
      const { app, server, storage } = await withLists([reading, piano]);
      server.failLists();
      const archive = mutation(app, () => useArchiveTopic());

      await act(() => archive.current.mutateAsync(piano.id));

      await waitFor(() => {
        const saved = JSON.parse(storage.data.get(topicSnapshotKey(ADA.id))!);
        expect(saved.lists['active:recent'].topics.map((t: Topic) => t.name)).toEqual(['Reading']);
      });
    });
  });

  it('asks the server again for the order, instead of sorting locally', async () => {
    const { app } = await withLists([reading, piano]);
    const restore = mutation(app, () => useRestoreTopic());
    const before = app.requests.length;

    await act(() => restore.current.mutateAsync(piano.id));

    await waitFor(() =>
      expect(
        app.requests.slice(before).filter((request) => request.method === 'GET').length,
      ).toBeGreaterThanOrEqual(4),
    );
  });

  it('leaves the lists alone when a mutation fails', async () => {
    const { app, lists } = await withLists([reading, piano]);
    const update = mutation(app, () => useUpdateTopic());
    const before = lists.result.current.all.data;

    await act(async () => {
      await update.current
        .mutateAsync({ id: chess.id, changes: { name: 'Nope' } })
        .catch(() => undefined);
    });

    expect(lists.result.current.all.data).toBe(before);
  });

  it('uses a query key under the signed-in user’s topics', () => {
    expect(topicsQueryKey({ status: 'active', sort: 'recent' })).toEqual([
      'me',
      'topics',
      'active:recent',
    ]);
    expect(topicsQueryKey()).toEqual(['me', 'topics', 'all:created']);
  });
});
