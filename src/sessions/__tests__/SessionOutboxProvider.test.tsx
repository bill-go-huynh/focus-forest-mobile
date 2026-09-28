import { act, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiProvider, createApi, createQueryClient, NetworkError, type Topic } from '../../api';
import {
  fakeFetch,
  makeSession,
  memoryTokenStore,
  NOW,
  type FakeRequest,
} from '../../test-utils/api';
import { makeSessionResult } from '../../test-utils/sessions';
import { memoryStorage } from '../../test-utils/storage';
import { makeTopic } from '../../test-utils/topics';
import { activeTimerKey, ActiveTimerStore } from '../../timer/active-timer-store';
import { ActiveTimerProvider } from '../../timer/ActiveTimerProvider';
import { toSubmission, type SessionSubmissionBody } from '../../timer/submission';
import type { SessionRules, TimerState } from '../../timer/timer-engine';
import { topicsQueryKey, useRecentTopics } from '../../topics/queries';
import { TopicCacheProvider } from '../../topics/TopicCacheProvider';
import { createTopicCreateQueue, TopicCreateQueueProvider } from '../../topics/topic-create-sync';
import { topicSnapshotKey, TopicSnapshotStore } from '../../topics/topic-snapshot-store';
import { createSessionOutbox } from '../app-session-outbox';
import { sessionOutboxKey, type SessionOutbox } from '../session-outbox';
import { SessionOutboxProvider } from '../SessionOutboxProvider';

const ADA = { id: '11111111-1111-4111-8111-111111111111', email: 'ada@example.com' };
const TOPIC = makeTopic();
const NEW_TOPIC_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const SESSION_ID = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6';
const RULES: SessionRules = { minValidMinutes: 5, maxPauseMinutes: 30 };
const MINUTE = 60_000;

type Reply = { status: number; body?: unknown } | Error;
type Storage = ReturnType<typeof memoryStorage>;

/**
 * A server with A2.2 topic creates, A2.5 session submissions, and A2.8 topic lists: the first
 * PUT of an id stores it (201), the same payload again replays (200). A session on an unknown
 * topic is a 404. Each topic's `lastUsedAt` and `lastPlannedMinutes` come from its latest stored
 * session, and `sort=recent` puts used topics first by latest use, then unused ones in creation
 * order. `loseNextSessionAnswer` stores the next session but the client only sees a network
 * failure; `listsDown` fails every GET.
 */
function apiServer(initial: Topic[] = [TOPIC]) {
  const topics = new Map(initial.map((topic) => [topic.id, topic]));
  const sessions = new Map<string, string>();
  const state = { down: false, loseNextSessionAnswer: false, listsDown: false };
  const present = (topic: Topic): Topic => {
    const latest = [...sessions.values()]
      .map((json) => JSON.parse(json) as SessionSubmissionBody)
      .filter((session) => session.topicId === topic.id)
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
    return latest
      ? { ...topic, lastUsedAt: latest.startedAt, lastPlannedMinutes: latest.plannedMinutes }
      : topic;
  };
  const usedAt = (topic: Topic) =>
    topic.lastUsedAt === null ? -Infinity : Date.parse(topic.lastUsedAt);
  const handler = ({ url, method, body }: FakeRequest): Reply => {
    if (state.down) return new NetworkError();
    const { pathname, searchParams } = new URL(url);
    const [, , resource, id = ''] = pathname.split('/');
    if (method === 'GET') {
      if (state.listsDown) return new NetworkError();
      const status = searchParams.get('status');
      const listed = [...topics.values()]
        .filter((topic) => !status || topic.status === status)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .map(present);
      if (searchParams.get('sort') === 'recent') listed.sort((a, b) => usedAt(b) - usedAt(a));
      return { status: 200, body: listed };
    }
    if (resource === 'topics' && method === 'PUT') {
      const topic = makeTopic({
        id,
        ...(body as object),
        createdAt: '2026-09-27T09:30:00.000Z',
        lastUsedAt: null,
        lastPlannedMinutes: null,
      });
      topics.set(id, topic);
      return { status: 201, body: present(topic) };
    }
    if (resource === 'sessions' && method === 'PUT') {
      const payload = body as SessionSubmissionBody;
      if (!topics.has(payload.topicId)) {
        return { status: 404, body: { statusCode: 404, message: 'Topic not found.' } };
      }
      const json = JSON.stringify(body);
      const earlier = sessions.get(id);
      if (earlier !== undefined && earlier !== json) {
        return {
          status: 409,
          body: { statusCode: 409, message: 'x', code: 'session_id_conflict' },
        };
      }
      sessions.set(id, json);
      if (state.loseNextSessionAnswer) {
        state.loseNextSessionAnswer = false;
        return new NetworkError();
      }
      return {
        status: earlier === undefined ? 201 : 200,
        body: makeSessionResult({ id, topicId: payload.topicId, startedAt: payload.startedAt }),
      };
    }
    return { status: 500 };
  };
  return { handler, state, sessions, topics };
}

/** One app process over the device storage, as the root layout wires it. */
async function launch(
  handler: (r: FakeRequest) => Reply,
  storage: Storage,
  now = NOW,
  probe: ReactNode = null,
) {
  const net = fakeFetch(handler);
  const api = createApi({
    baseUrl: 'https://api.example.com',
    fetch: net.fetch,
    store: memoryTokenStore(makeSession({ user: ADA })),
    now: () => NOW,
  });
  const queryClient = createQueryClient();
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
  const snapshots = new TopicSnapshotStore({ storage, report: () => undefined });
  const topicQueue = createTopicCreateQueue({
    storage,
    client: api.client,
    queryClient,
    snapshots,
    createId: () => NEW_TOPIC_ID,
    report: () => undefined,
  });
  const timers = new ActiveTimerStore({
    storage,
    now: () => now,
    createId: () => SESSION_ID,
    report: () => undefined,
  });
  const outbox = createSessionOutbox({
    storage,
    client: api.client,
    queryClient,
    topicQueue,
    report: () => undefined,
    now: () => now,
  });
  await api.session.restore();
  function Providers({ children }: { children?: ReactNode }) {
    return (
      <ApiProvider api={api} queryClient={queryClient}>
        <ActiveTimerProvider store={timers}>
          <TopicCacheProvider store={snapshots}>
            <TopicCreateQueueProvider queue={topicQueue}>
              <SessionOutboxProvider outbox={outbox}>{children}</SessionOutboxProvider>
            </TopicCreateQueueProvider>
          </TopicCacheProvider>
        </ActiveTimerProvider>
      </ApiProvider>
    );
  }
  const view = render(<Providers>{probe}</Providers>);
  return {
    api,
    queryClient,
    snapshots,
    timers,
    topicQueue,
    outbox,
    requests: net.requests,
    view,
  };
}

/** A finished timer left on the device by an earlier process (killed before the handoff). */
async function finishedTimerOnDevice(storage: Storage, topicId = TOPIC.id) {
  const timers = new ActiveTimerStore({
    storage,
    now: () => NOW - 30 * MINUTE,
    createId: () => SESSION_ID,
    report: () => undefined,
  });
  await timers.activate(ADA.id);
  await timers.start({ topicId, plannedMinutes: 25, rules: RULES });
  // Restored at NOW, it settles at its completion, 25 minutes after the start.
  return toSubmission({
    ...(timers.getSnapshot().timer as TimerState),
    finished: { at: NOW - 5 * MINUTE, reason: 'completed' },
  });
}

const sessionPuts = (requests: FakeRequest[]) =>
  requests.filter((r) => r.method === 'PUT' && r.url.includes('/me/sessions/'));
const queued = (outbox: SessionOutbox) => outbox.getSnapshot().items.map((i) => i.id);

describe('SessionOutboxProvider', () => {
  it('hands off a finished timer at an offline launch, then syncs it at the next online launch', async () => {
    const storage = memoryStorage();
    const expected = await finishedTimerOnDevice(storage);
    const server = apiServer();
    server.state.down = true;

    const offline = await launch(server.handler, storage);
    await waitFor(() => expect(queued(offline.outbox)).toEqual([SESSION_ID]));
    await waitFor(() => expect(storage.data.has(activeTimerKey(ADA.id))).toBe(false));
    expect(offline.timers.getSnapshot().timer).toBeNull();
    offline.view.unmount();

    server.state.down = false;
    const online = await launch(server.handler, storage);
    await waitFor(() => expect(storage.data.get(sessionOutboxKey(ADA.id))).toContain('"items":[]'));

    expect(sessionPuts(online.requests).map((r) => r.body)).toEqual([expected.body]);
    expect(server.sessions.size).toBe(1);
  });

  it('hands off and syncs a session the user ends while the app is open', async () => {
    const storage = memoryStorage();
    const server = apiServer();
    const app = await launch(server.handler, storage);
    await waitFor(() => expect(app.timers.getSnapshot().status).toBe('ready'));
    await act(async () => {
      await app.timers.start({ topicId: TOPIC.id, plannedMinutes: 25, rules: RULES });
      await app.timers.end();
    });

    await waitFor(() => expect(server.sessions.has(SESSION_ID)).toBe(true));
    await waitFor(() => expect(app.outbox.getSnapshot().synced[SESSION_ID]).toBeDefined());
    expect(app.timers.getSnapshot().timer).toBeNull();
    expect(queued(app.outbox)).toEqual([]);
  });

  it('replays a session whose answer was lost: stored once, never duplicated', async () => {
    const storage = memoryStorage();
    const expected = await finishedTimerOnDevice(storage);
    const server = apiServer();
    server.state.loseNextSessionAnswer = true;

    const first = await launch(server.handler, storage);
    await waitFor(() => expect(sessionPuts(first.requests)).toHaveLength(1));
    await waitFor(() => expect(first.outbox.getSnapshot().items[0]?.state).toBe('pending'));
    first.view.unmount();

    const next = await launch(server.handler, storage);
    await waitFor(() => expect(queued(next.outbox)).toEqual([]));

    expect(sessionPuts(next.requests).map((r) => r.body)).toEqual([expected.body]);
    expect(server.sessions.size).toBe(1);
    expect(next.outbox.getSnapshot().synced[SESSION_ID]).toBeDefined();
  });

  it('sends a topic created offline before the session that uses it', async () => {
    const storage = memoryStorage();
    const server = apiServer();
    server.state.down = true;
    const offline = await launch(server.handler, storage);
    await waitFor(() => expect(offline.topicQueue.getSnapshot().status).toBe('ready'));
    await act(async () => {
      await offline.topicQueue.enqueue({ name: 'Piano', icon: 'music', color: 'topic.2' });
    });
    await act(async () => {
      await offline.timers.start({ topicId: NEW_TOPIC_ID, plannedMinutes: 25, rules: RULES });
      await offline.timers.end();
    });
    await waitFor(() => expect(queued(offline.outbox)).toEqual([SESSION_ID]));
    offline.view.unmount();

    server.state.down = false;
    const online = await launch(server.handler, storage);
    await waitFor(() => expect(queued(online.outbox)).toEqual([]));

    const puts = online.requests.filter((r) => r.method === 'PUT').map((r) => r.url);
    expect(puts).toEqual([
      `https://api.example.com/me/topics/${NEW_TOPIC_ID}`,
      `https://api.example.com/me/sessions/${SESSION_ID}`,
    ]);
    expect(server.sessions.has(SESSION_ID)).toBe(true);
  });

  it('keeps queued sessions through sign-out and sends them when the same user signs back in', async () => {
    const storage = memoryStorage();
    await finishedTimerOnDevice(storage);
    const server = apiServer();
    server.state.down = true;
    const app = await launch(server.handler, storage);
    await waitFor(() => expect(queued(app.outbox)).toEqual([SESSION_ID]));

    await act(async () => {
      await app.api.session.clear();
    });
    expect(app.outbox.getSnapshot().status).toBe('inactive');
    expect(storage.data.get(sessionOutboxKey(ADA.id))).toContain(SESSION_ID);

    server.state.down = false;
    await act(async () => {
      await app.api.session.setSession(makeSession({ user: ADA }));
    });

    await waitFor(() => expect(server.sessions.has(SESSION_ID)).toBe(true));
    await waitFor(() => expect(queued(app.outbox)).toEqual([]));
  });
});

describe('topic metadata after a session syncs', () => {
  // Reading was used the day before for 45 minutes; Piano was created later and never used.
  const reading = makeTopic({
    lastUsedAt: '2026-09-25T09:00:00.000Z',
    lastPlannedMinutes: 45,
    createdAt: '2026-09-25T08:00:00.000Z',
  });
  const piano = makeTopic({
    id: '6e2d4a6f-3b5c-4d7e-9f80-0b1c2d3e4f50',
    name: 'Piano',
    createdAt: '2026-09-25T08:30:00.000Z',
    lastUsedAt: null,
    lastPlannedMinutes: null,
  });
  const recentIds = (topics: Topic[] | undefined) => topics?.map((topic) => topic.id);
  const savedRecent = (storage: Storage) =>
    JSON.parse(storage.data.get(topicSnapshotKey(ADA.id)) ?? '{"lists":{}}').lists['active:recent']
      ?.topics as Topic[] | undefined;

  function RecentProbe({ seen }: { seen: { current: Topic[] | undefined } }) {
    seen.current = useRecentTopics().data;
    return null;
  }

  async function openWithRecent(server: ReturnType<typeof apiServer>, storage: Storage) {
    const seen: { current: Topic[] | undefined } = { current: undefined };
    const app = await launch(server.handler, storage, NOW, <RecentProbe seen={seen} />);
    await waitFor(() => expect(recentIds(seen.current)).toEqual([reading.id, piano.id]));
    return { ...app, seen };
  }

  it("shows the server's new last use, remembered duration, and order once the session syncs", async () => {
    const storage = memoryStorage();
    const server = apiServer([reading, piano]);
    const app = await openWithRecent(server, storage);

    await act(async () => {
      await app.timers.start({ topicId: piano.id, plannedMinutes: 25, rules: RULES });
      await app.timers.end();
    });

    await waitFor(() => expect(recentIds(app.seen.current)).toEqual([piano.id, reading.id]));
    expect(app.seen.current?.[0]).toMatchObject({
      lastUsedAt: new Date(NOW).toISOString(),
      lastPlannedMinutes: 25,
    });
    // The new list is the server's answer, saved by the topics query as usual.
    await waitFor(() => expect(recentIds(savedRecent(storage))).toEqual([piano.id, reading.id]));
    expect(savedRecent(storage)?.[0]?.lastPlannedMinutes).toBe(25);
  });

  it('counts the session as synced when the topic lists cannot be refetched, and keeps the old lists as they were', async () => {
    const storage = memoryStorage();
    const server = apiServer([reading, piano]);
    const app = await openWithRecent(server, storage);
    const before = app.queryClient.getQueryData<Topic[]>(topicsQueryKey('active:recent'));
    const savedBefore = storage.data.get(topicSnapshotKey(ADA.id));
    server.state.listsDown = true;
    const gets = () => app.requests.filter((r) => r.method === 'GET').length;
    const getsBefore = gets();

    await act(async () => {
      await app.timers.start({ topicId: piano.id, plannedMinutes: 25, rules: RULES });
      await app.timers.end();
    });

    await waitFor(() => expect(app.outbox.getSnapshot().synced[SESSION_ID]).toBeDefined());
    await waitFor(() => expect(gets()).toBeGreaterThan(getsBefore));
    await waitFor(() =>
      expect(app.queryClient.getQueryState(topicsQueryKey('active:recent'))?.status).toBe('error'),
    );
    expect(queued(app.outbox)).toEqual([]);
    expect(storage.data.get(sessionOutboxKey(ADA.id))).toContain('"items":[]');
    expect(sessionPuts(app.requests)).toHaveLength(1);
    // Nothing is made up: the cached and saved lists are the last server answers, unchanged.
    expect(app.queryClient.getQueryData(topicsQueryKey('active:recent'))).toBe(before);
    expect(app.seen.current).toEqual([reading, piano]);
    expect(storage.data.get(topicSnapshotKey(ADA.id))).toBe(savedBefore);
  });

  it('does not refresh topics when the session was not synced', async () => {
    const storage = memoryStorage();
    const server = apiServer([reading, piano]);
    const handler = (request: FakeRequest): Reply =>
      request.method === 'PUT' && request.url.includes('/me/sessions/')
        ? { status: 409, body: { statusCode: 409, message: 'x', code: 'session_overlap' } }
        : server.handler(request);
    const seen: { current: Topic[] | undefined } = { current: undefined };
    const app = await launch(handler, storage, NOW, <RecentProbe seen={seen} />);
    await waitFor(() => expect(recentIds(seen.current)).toEqual([reading.id, piano.id]));
    const getsBefore = app.requests.filter((r) => r.method === 'GET').length;

    await act(async () => {
      await app.timers.start({ topicId: piano.id, plannedMinutes: 25, rules: RULES });
      await app.timers.end();
    });

    await waitFor(() => expect(app.outbox.getSnapshot().items[0]?.state).toBe('needs_attention'));
    expect(app.requests.filter((r) => r.method === 'GET')).toHaveLength(getsBefore);
  });
});
