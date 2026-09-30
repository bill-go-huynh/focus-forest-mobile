import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from 'expo-router/testing-library';

import { NetworkError, type FocusSession, type Topic } from '../api';
import type { SessionHistoryItem } from '../api/history';
import { sessionRulesKey } from '../focus/session-rules';
import { historySnapshotKey } from '../history/history-snapshot-store';
import { completionReceiptsKey } from '../sessions/completion-receipts';
import { sessionNoteOutboxKey } from '../sessions/session-note-outbox';
import { sessionOutboxKey, type QueuedSession } from '../sessions/session-outbox';
import { activeTimerKey } from '../timer/active-timer-store';
import { deviceClock } from '../timer/app-timer-store';
import type { TimerState } from '../timer/timer-engine';
import { topicCreateQueueKey } from '../topics/topic-create-queue';
import { topicSnapshotKey, TopicSnapshotStore } from '../topics/topic-snapshot-store';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { mockAppState } from '../test-utils/app-state';
import { makeHistoryItem } from '../test-utils/history';
import { scheduledNotifications } from '../test-utils/notifications-mock';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { makeSessionResult } from '../test-utils/sessions';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { makeTopic } from '../test-utils/topics';

/**
 * Phase 2 end to end: the modules together under one lifecycle (topics, rules, timer, outbox,
 * notes, receipts, history), through the real routes and the device storage, with kills
 * (unmount and relaunch over the same storage), network loss, and user switches.
 */

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

const mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

const API = 'https://api.example.com';
const ADA = { id: 'user-1', email: 'ada@example.com' };
const BEA = { id: 'user-2', email: 'bea@example.com' };
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const PENDING_TOPIC = 'aaaaaaaa-0000-4000-8000-00000000000a';
const SESSION_ID = '0192f1a2-3b4c-7d5e-8f60-bbbbbbbbbbbb';

const reading: Topic = makeTopic({
  id: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
  name: 'Reading',
  description: null,
  lastUsedAt: '2026-09-25T09:00:00.000Z',
  lastPlannedMinutes: 25,
});

/**
 * The Phase 2 API: topics (A2.2, `nameTaken` names answer 409 `topic_name_taken`), rules,
 * sessions (A2.5: the answer's `endedAt` is the server's effective end, one second before the
 * raw end; a replay answers the stored row), notes (A2.6), and history (A2.7, one page).
 * `offline` fails everything but preferences.
 */
function phase2Api() {
  const topics = new Map<string, Topic>([[reading.id, reading]]);
  const sessions = new Map<string, FocusSession>();
  const state = {
    offline: false,
    nameTaken: new Set<string>(),
    rules: { maxPauseMinutes: 30 },
    /** While set, a session PUT waits for it before it is answered. */
    holdSessionPut: null as Promise<void> | null,
  };
  const handler = async ({ url, method, body }: FakeRequest) => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences')
      return { status: 200, body: makePreferences({ reducedMotion: true }) };
    if (state.offline) return new NetworkError();
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 2, minValidMinutes: 5, ...state.rules } };
    if (pathname === '/me/topics' && method === 'GET')
      return { status: 200, body: [...topics.values()] };
    const [, , resource, id = '', tail] = pathname.split('/');
    if (resource === 'topics' && method === 'PUT') {
      const fields = body as { name: string };
      if (state.nameTaken.has(fields.name.toLowerCase())) {
        return {
          status: 409,
          body: { statusCode: 409, message: 'Taken.', code: 'topic_name_taken' },
        };
      }
      const created = makeTopic({ id, ...fields, lastUsedAt: null, lastPlannedMinutes: null });
      topics.set(id, created);
      return { status: 201, body: created };
    }
    if (resource === 'sessions' && method === 'GET' && !id) {
      const items: SessionHistoryItem[] = [...sessions.values()].map((session) => {
        const topic = topics.get(session.topicId)!;
        return makeHistoryItem({
          ...session,
          topic: {
            id: topic.id,
            name: topic.name,
            icon: topic.icon,
            color: topic.color,
            status: topic.status,
          },
        });
      });
      return { status: 200, body: { items, nextCursor: null } };
    }
    if (resource === 'sessions' && method === 'PUT') {
      if (state.holdSessionPut) await state.holdSessionPut;
      if (!topics.has((body as { topicId: string }).topicId))
        return { status: 404, body: nestError(404, 'Topic not found.') };
      const earlier = sessions.get(id);
      if (earlier) return { status: 200, body: earlier };
      const payload = body as { topicId: string; startedAt: string; endedAt: string };
      const stored = makeSessionResult({
        id,
        topicId: payload.topicId,
        startedAt: payload.startedAt,
        endedAt: new Date(Date.parse(payload.endedAt) - SECOND).toISOString(),
        status: 'ended_early',
        counted: true,
        note: null,
      });
      sessions.set(id, stored);
      return { status: 201, body: stored };
    }
    if (resource === 'sessions' && method === 'PATCH' && tail === 'note') {
      const earlier = sessions.get(id);
      if (!earlier) return { status: 404, body: nestError(404, 'Session not found.') };
      const updated = { ...earlier, note: (body as { note: string | null }).note };
      sessions.set(id, updated);
      return { status: 200, body: updated };
    }
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
  return { handler, state, topics, sessions };
}

let server: ReturnType<typeof phase2Api>;
let requests: FakeRequest[];
let appState: ReturnType<typeof mockAppState>;
let clock = 0;
let T0 = 0;
const originalFetch = globalThis.fetch;

function serve() {
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
}

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = API;
  mockWindow.fontScale = 1;
  await AsyncStorage.clear();
  signInForTest(ADA);
  server = phase2Api();
  serve();
  T0 = Date.now();
  clock = T0;
  jest.spyOn(deviceClock, 'now').mockImplementation(() => clock);
  appState = mockAppState();
});
afterEach(async () => {
  await settleSheetTransitions();
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

/** Reads the device storage inside act, so updates it lets through are wrapped. */
const read = async <T,>(key: string): Promise<T | null> => {
  let raw: string | null = null;
  await act(async () => {
    raw = await AsyncStorage.getItem(key);
  });
  return raw === null ? null : (JSON.parse(raw) as T);
};
const outboxItems = async (userId = ADA.id) =>
  (await read<{ items: QueuedSession[] }>(sessionOutboxKey(userId)))?.items ?? [];
const noteItems = async (userId = ADA.id) =>
  (
    await read<{ items: { sessionId: string; note: string | null; state: string }[] }>(
      sessionNoteOutboxKey(userId),
    )
  )?.items ?? [];
const queuedTopics = async (userId = ADA.id) =>
  (await read<{ items: { id: string; state: string }[] }>(topicCreateQueueKey(userId)))?.items ??
  [];
/** Writes that change server state, in the order they were sent. */
const writes = () =>
  requests
    .filter((r) => r.method !== 'GET')
    .filter((r) => !r.url.endsWith('/me/preferences'))
    .map((r) => `${r.method} ${new URL(r.url).pathname}`);
const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
/** Waits inside act for an element while background sync runs, then returns it. */
async function appears(role: 'button' | 'tab', name: string) {
  await until(() => screen.queryByRole(role, { name }) !== null);
  return screen.getByRole(role, { name });
}

/** Waits for something the app stores (`read` runs inside act, so its updates are wrapped). */
async function untilStored(check: () => Promise<boolean>) {
  for (let i = 0; i < 200; i += 1) {
    if (await check()) return;
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
  }
  throw new Error('Never stored.');
}

/** A session already handed off to the outbox (the only way a note can be queued for it). */
async function queueSession(topicId: string, userId = ADA.id) {
  const payload = {
    topicId,
    startedAt: new Date(T0 - 20 * MINUTE).toISOString(),
    endedAt: new Date(T0 - 5 * MINUTE).toISOString(),
    plannedMinutes: 25,
    pauseIntervals: [],
  };
  await AsyncStorage.setItem(
    sessionOutboxKey(userId),
    JSON.stringify({
      version: 1,
      items: [{ id: SESSION_ID, payload, state: 'pending', reason: null, queuedAt: 1 }],
    }),
  );
  return payload;
}

async function queuePendingTopic(name = 'Sketching', userId = ADA.id) {
  await AsyncStorage.setItem(
    topicCreateQueueKey(userId),
    JSON.stringify({
      version: 1,
      items: [
        {
          id: PENDING_TOPIC,
          payload: { name, icon: 'topic.default', color: 'topic.1', description: null },
          state: 'pending',
          attempted: false,
          queuedAt: 1,
        },
      ],
    }),
  );
}
async function saveRulesAndTopics(userId = ADA.id) {
  await AsyncStorage.setItem(
    sessionRulesKey,
    JSON.stringify({ version: 1, rules: { version: 4, minValidMinutes: 5, maxPauseMinutes: 25 } }),
  );
  const store = new TopicSnapshotStore({ storage: AsyncStorage, report: () => undefined });
  await store.activate(userId);
  await store.save(userId, { status: 'active', sort: 'recent' }, [reading], clock);
}

describe('Flow B + C: a session focused entirely offline on a topic created offline', () => {
  it('survives a kill offline, then syncs topic → session → note in order, unchanged', async () => {
    await saveRulesAndTopics();
    await queuePendingTopic();
    server.state.offline = true;

    // Cold launch offline: start on the pending topic, pause, resume, end early.
    const first = renderApp(appRoutes, { initialUrl: '/' });
    fireEvent.press(await screen.findByRole('button', { name: 'Start Focus' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Sketching, Waiting to sync' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Start focus' }));
    await screen.findByRole('button', { name: 'Time left' });
    const started = await read<TimerState>(activeTimerKey(ADA.id));
    expect(started).toMatchObject({
      topicId: PENDING_TOPIC,
      plannedMinutes: 15,
      // The saved rules, copied into the timer: the server's later rules never change them.
      rules: { minValidMinutes: 5, maxPauseMinutes: 25 },
    });
    const sessionId = started!.id;

    clock = T0 + 4 * MINUTE;
    fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    await screen.findByRole('button', { name: 'Resume' });
    clock = T0 + 6 * MINUTE;
    fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    await screen.findByRole('button', { name: 'Pause' });
    clock = T0 + 11 * MINUTE;
    fireEvent.press(screen.getByRole('button', { name: 'End session' }));
    const confirm = await screen.findAllByRole('button', { name: 'End session' });
    fireEvent.press(confirm[confirm.length - 1]!);

    // Completion from the device's measure only: no outcome before the server answers.
    expect(await screen.findByRole('header', { name: 'Focus session finished' })).toBeOnTheScreen();
    expect(screen.getByText('9 min focused')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Note'), 'Sketched hands');
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('button', { name: 'Start Focus' });

    const [queued] = await outboxItems();
    const payload = queued!.payload;
    // Its topic is not on the server yet: blocked until it is, never sent before it.
    expect(queued).toMatchObject({ id: sessionId, state: 'blocked_topic' });
    expect(payload).toEqual({
      topicId: PENDING_TOPIC,
      startedAt: new Date(T0).toISOString(),
      endedAt: new Date(T0 + 11 * MINUTE).toISOString(),
      plannedMinutes: 15,
      pauseIntervals: [
        {
          startedAt: new Date(T0 + 4 * MINUTE).toISOString(),
          endedAt: new Date(T0 + 6 * MINUTE).toISOString(),
        },
      ],
    });
    expect(await noteItems()).toEqual([
      expect.objectContaining({ sessionId, note: 'Sketched hands', state: 'pending' }),
    ]);
    expect(await read(activeTimerKey(ADA.id))).toBeNull();
    // Offline, only the topic create was tried: never the session, never the note.
    expect(writes().every((write) => write === `PUT /me/topics/${PENDING_TOPIC}`)).toBe(true);
    first.unmount();

    // Relaunch, still offline: nothing lost, no timer back, the session still local.
    const second = renderApp(appRoutes, { initialUrl: `/completion/${sessionId}` });
    expect(await screen.findByRole('header', { name: 'Focus session finished' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Note').props.value).toBe('Sketched hands');
    expect(screen.getByText('Note saved on this device.')).toBeOnTheScreen();
    expect(await read(activeTimerKey(ADA.id))).toBeNull();
    expect((await outboxItems())[0]?.payload).toEqual(payload);
    expect(await read(completionReceiptsKey(ADA.id))).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: 'Start Focus' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Resume focus' })).toBeNull();

    // Back online, at the next foreground: topic, then session, then note.
    const triedOffline = writes().length;
    server.state.offline = false;
    await appState.emit('background');
    await appState.emit('active');
    await untilStored(async () => (await noteItems()).length === 0);

    expect(writes().slice(triedOffline)).toEqual([
      `PUT /me/topics/${PENDING_TOPIC}`,
      `PUT /me/sessions/${sessionId}`,
      `PATCH /me/sessions/${sessionId}/note`,
    ]);
    const put = requests.find((r) => r.method === 'PUT' && r.url.includes('/me/sessions/'));
    expect(put?.body).toEqual(payload);
    expect(await outboxItems()).toEqual([]);
    expect(await queuedTopics()).toEqual([]);
    // The receipt is the server's answer: its effective end, and the note it confirmed.
    const receipts = (await read<{ receipts: FocusSession[] }>(completionReceiptsKey(ADA.id)))!
      .receipts;
    expect(receipts).toEqual([server.sessions.get(sessionId)]);
    expect(receipts[0]?.endedAt).not.toBe(payload.endedAt);
    expect(receipts[0]?.note).toBe('Sketched hands');

    // History lists the server's session, under the created topic.
    fireEvent.press(screen.getByRole('tab', { name: 'Insights' }));
    expect(
      await screen.findByRole('button', { name: /^Sketching, .*Ended early/ }),
    ).toBeOnTheScreen();
    second.unmount();
  });

  it('keeps the session blocked while its topic needs a new name, then sends it unchanged', async () => {
    await queuePendingTopic('Sketching');
    server.state.nameTaken.add('sketching');
    const queuedPayload = await queueSession(PENDING_TOPIC);
    await AsyncStorage.setItem(
      sessionNoteOutboxKey(ADA.id),
      JSON.stringify({
        version: 1,
        items: [
          {
            sessionId: SESSION_ID,
            note: 'Hands',
            revision: 1,
            state: 'pending',
            reason: null,
            savedAt: 1,
          },
        ],
      }),
    );

    renderApp(appRoutes, { initialUrl: '/' });
    await until(() => writes().length === 1);
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
    expect((await queuedTopics())[0]?.state).toBe('needs_name_change');
    expect((await outboxItems())[0]?.state).toBe('blocked_topic');
    const payload = (await outboxItems())[0]!.payload;
    expect(payload).toEqual(queuedPayload);
    expect(writes()).toEqual([`PUT /me/topics/${PENDING_TOPIC}`]);

    // The user renames the same topic (same id) from Profile → Topics.
    fireEvent.press(await appears('tab', 'Profile'));
    fireEvent.press(await appears('button', 'Topics'));
    fireEvent.press(await appears('button', 'Sketching, Choose another name to sync this topic.'));
    await until(() => screen.queryByLabelText('Name') !== null);
    fireEvent.changeText(screen.getByLabelText('Name'), 'Sketch club');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await until(() => server.sessions.get(SESSION_ID)?.note === 'Hands');
    await untilStored(async () => (await noteItems()).length === 0);
    expect(writes()).toEqual([
      `PUT /me/topics/${PENDING_TOPIC}`,
      `PUT /me/topics/${PENDING_TOPIC}`,
      `PUT /me/sessions/${SESSION_ID}`,
      `PATCH /me/sessions/${SESSION_ID}/note`,
    ]);
    const put = requests.find((r) => r.url.endsWith(`/me/sessions/${SESSION_ID}`));
    expect(put?.body).toEqual(payload);
    expect(server.sessions.get(SESSION_ID)?.topicId).toBe(PENDING_TOPIC);
    // The synced session refreshes the topic lists and history: let that finish inside act.
    const putAt = requests.findIndex((r) => r.url.endsWith(`/me/sessions/${SESSION_ID}`));
    await until(() =>
      requests
        .slice(putAt)
        .some((r) => r.method === 'GET' && new URL(r.url).pathname === '/me/topics'),
    );
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
  });
});

describe('a note never overtakes its session', () => {
  it('waits while the timer still holds the session, and while its PUT is unanswered', async () => {
    // A note queued while the session is still only in the timer (not handed off yet).
    const finished: TimerState = {
      version: 1,
      id: SESSION_ID,
      topicId: reading.id,
      plannedMinutes: 25,
      rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
      startedAt: T0 - 20 * MINUTE,
      pauses: [],
      pausedAt: null,
      finished: { at: T0 - 5 * MINUTE, reason: 'ended' },
    };
    await AsyncStorage.setItem(activeTimerKey(ADA.id), JSON.stringify(finished));
    await AsyncStorage.setItem(
      sessionNoteOutboxKey(ADA.id),
      JSON.stringify({
        version: 1,
        items: [
          {
            sessionId: SESSION_ID,
            note: 'Early',
            revision: 1,
            state: 'pending',
            reason: null,
            savedAt: 1,
          },
        ],
      }),
    );
    let answer: () => void = () => undefined;
    server.state.holdSessionPut = new Promise<void>((resolve) => (answer = resolve));

    renderApp(appRoutes, { initialUrl: '/' });

    // Handed off and sent, but not answered: no note yet.
    await until(() => writes().includes(`PUT /me/sessions/${SESSION_ID}`));
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
    expect(await read(activeTimerKey(ADA.id))).toBeNull();
    expect((await outboxItems()).map((item) => item.id)).toEqual([SESSION_ID]);
    expect(writes()).toEqual([`PUT /me/sessions/${SESSION_ID}`]);

    // Answered: now the note goes, after it.
    await act(async () => answer());
    await until(() => server.sessions.get(SESSION_ID)?.note === 'Early');
    expect(writes()).toEqual([
      `PUT /me/sessions/${SESSION_ID}`,
      `PATCH /me/sessions/${SESSION_ID}/note`,
    ]);
    await untilStored(async () => (await noteItems()).length === 0);
  });
});

describe('a note for a session already on the server', () => {
  it('is sent at launch once the timer is read, however late that read is', async () => {
    server.sessions.set(SESSION_ID, makeSessionResult({ id: SESSION_ID, topicId: reading.id }));
    await AsyncStorage.setItem(
      sessionNoteOutboxKey(ADA.id),
      JSON.stringify({
        version: 1,
        items: [
          {
            sessionId: SESSION_ID,
            note: 'Later words',
            revision: 1,
            state: 'pending',
            reason: null,
            savedAt: 1,
          },
        ],
      }),
    );
    const getItem = AsyncStorage.getItem as jest.Mock;
    const originalGetItem = getItem.getMockImplementation()!;
    getItem.mockImplementation(async (key: string) => {
      if (key === activeTimerKey(ADA.id)) {
        await new Promise<void>((resolve) => setTimeout(resolve, 300));
      }
      return originalGetItem(key);
    });
    try {
      renderApp(appRoutes, { initialUrl: '/' });
      // No foreground, no outbox change: the timer being read is what lets the note go.
      await until(() => server.sessions.get(SESSION_ID)?.note === 'Later words');
    } finally {
      getItem.mockImplementation(originalGetItem);
    }
    await untilStored(async () => (await noteItems()).length === 0);
  });
});

describe('Flow G/H: the plan runs out while End is being confirmed, app open', () => {
  it('is woken at C, stored as completed at C, and the open question goes away', async () => {
    const running: TimerState = {
      version: 1,
      id: SESSION_ID,
      topicId: reading.id,
      plannedMinutes: 25,
      rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
      // C is one second away on the real clock, so the foreground wake-up fires here.
      startedAt: T0 - 25 * MINUTE + SECOND,
      pauses: [],
      pausedAt: null,
      finished: null,
    };
    await AsyncStorage.setItem(activeTimerKey(ADA.id), JSON.stringify(running));
    renderApp(appRoutes, { initialUrl: '/' });
    fireEvent.press(await screen.findByRole('button', { name: 'Resume focus' }));
    fireEvent.press(await screen.findByRole('button', { name: 'End session' }));
    await screen.findAllByRole('button', { name: 'End session' });

    clock = T0 + 5 * SECOND;
    await shows(/Focus session (finished|saved)/);

    const sessionPut = () => requests.find((r) => r.url.endsWith(`/me/sessions/${SESSION_ID}`));
    await until(() => sessionPut() !== undefined);
    // Completed at C (not ended early at the confirmation): the raw end is exactly C.
    expect(sessionPut()?.body).toMatchObject({ endedAt: new Date(T0 + SECOND).toISOString() });
    expect(screen.queryByRole('button', { name: 'Keep focusing' })).toBeNull();
    expect(scheduledNotifications()).toEqual([]);
    await untilStored(async () => (await outboxItems()).length === 0);
  });
});

describe('Flow M: one device, two users', () => {
  /** Everything Ada keeps on the device, across every Phase 2 store. */
  async function seedAda() {
    const running: TimerState = {
      version: 1,
      id: '0192f1a2-3b4c-7d5e-8f60-cccccccccccc',
      topicId: reading.id,
      plannedMinutes: 25,
      rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
      startedAt: T0 - 5 * MINUTE,
      pauses: [],
      pausedAt: null,
      finished: null,
    };
    const synced = makeSessionResult({ id: SESSION_ID, topicId: reading.id, status: 'completed' });
    const queuedId = '0192f1a2-3b4c-7d5e-8f60-dddddddddddd';
    await AsyncStorage.multiSet([
      [activeTimerKey(ADA.id), JSON.stringify(running)],
      [
        sessionOutboxKey(ADA.id),
        JSON.stringify({
          version: 1,
          items: [
            {
              id: queuedId,
              payload: {
                topicId: reading.id,
                startedAt: new Date(T0 - 60 * MINUTE).toISOString(),
                endedAt: new Date(T0 - 40 * MINUTE).toISOString(),
                plannedMinutes: 25,
                pauseIntervals: [],
              },
              state: 'pending',
              reason: null,
              queuedAt: 1,
            },
          ],
        }),
      ],
      [
        sessionNoteOutboxKey(ADA.id),
        JSON.stringify({
          version: 1,
          items: [
            {
              sessionId: queuedId,
              note: 'Ada only',
              revision: 1,
              state: 'pending',
              reason: null,
              savedAt: 1,
            },
          ],
        }),
      ],
      [completionReceiptsKey(ADA.id), JSON.stringify({ version: 1, receipts: [synced] })],
      [
        historySnapshotKey(ADA.id),
        JSON.stringify({
          version: 1,
          savedAt: 1,
          items: [
            makeHistoryItem({
              ...synced,
              topic: {
                id: reading.id,
                name: 'Ada topic',
                icon: 'topic.default',
                color: 'topic.1',
                status: 'active',
              },
            }),
          ],
        }),
      ],
    ]);
    await queuePendingTopic('Ada pending', ADA.id);
    await saveRulesAndTopics(ADA.id);
    const keys = [
      activeTimerKey,
      sessionOutboxKey,
      sessionNoteOutboxKey,
      completionReceiptsKey,
      historySnapshotKey,
      topicCreateQueueKey,
      topicSnapshotKey,
    ].map((key) => key(ADA.id));
    return Object.fromEntries(await AsyncStorage.multiGet(keys));
  }

  it("never shows or sends Ada's data to Bea, keeps it, and gives it back to Ada", async () => {
    const ada = await seedAda();
    signInForTest(BEA);
    server.state.offline = true;

    // Bea, offline: no timer, no receipt, no history, no topics of Ada's.
    const bea = renderApp(appRoutes, { initialUrl: '/' });
    expect(await screen.findByRole('button', { name: 'Start Focus' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Resume focus' })).toBeNull();
    fireEvent.press(screen.getByRole('tab', { name: 'Insights' }));
    expect(
      await screen.findByText("We couldn't load your focus history right now.", undefined, {
        timeout: 10_000,
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Ada topic')).toBeNull();
    bea.unmount();

    const beaCompletion = renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    expect(await screen.findByText("This session isn't on this device.")).toBeOnTheScreen();
    beaCompletion.unmount();

    // Online, Bea's app sends nothing of Ada's.
    server.state.offline = false;
    const online = renderApp(appRoutes, { initialUrl: '/' });
    fireEvent.press(await screen.findByRole('button', { name: 'Start Focus' }));
    await screen.findByRole('button', { name: /^Reading\b/ });
    expect(screen.queryByText('Ada pending')).toBeNull();
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
    expect(writes()).toEqual([]);
    online.unmount();

    // Ada's data is exactly as she left it.
    const keys = Object.keys(ada);
    expect(Object.fromEntries(await AsyncStorage.multiGet(keys))).toEqual(ada);
    expect(
      (await AsyncStorage.getAllKeys()).filter((key) => key.endsWith(`/${BEA.id}`)).sort(),
    ).not.toContain(activeTimerKey(BEA.id));

    // Ada back, offline: her timer, her history, her receipt.
    signInForTest(ADA);
    server.state.offline = true;
    const back = renderApp(appRoutes, { initialUrl: '/' });
    expect(await screen.findByRole('button', { name: 'Resume focus' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('tab', { name: 'Insights' }));
    expect(await screen.findByRole('button', { name: /^Ada topic, / })).toBeOnTheScreen();
    back.unmount();
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    expect(await screen.findByRole('header', { name: 'Session complete' })).toBeOnTheScreen();
  });
});

describe('Flow N: corrupt caches never touch the data that exists nowhere else', () => {
  it('sets aside corrupt topics, receipts, and history, and still syncs the queued session', async () => {
    await queueSession(reading.id);
    await AsyncStorage.multiSet([
      [topicSnapshotKey(ADA.id), '{broken'],
      [completionReceiptsKey(ADA.id), '{broken'],
      [historySnapshotKey(ADA.id), '{broken'],
      [
        sessionNoteOutboxKey(ADA.id),
        JSON.stringify({
          version: 1,
          items: [
            {
              sessionId: SESSION_ID,
              note: 'Kept',
              revision: 1,
              state: 'pending',
              reason: null,
              savedAt: 1,
            },
          ],
        }),
      ],
    ]);

    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });

    expect(await screen.findByRole('header', { name: 'Focus session saved' })).toBeOnTheScreen();
    await untilStored(async () => (await noteItems()).length === 0);
    expect(server.sessions.get(SESSION_ID)?.note).toBe('Kept');
    expect(await outboxItems()).toEqual([]);
    for (const key of [
      topicSnapshotKey(ADA.id),
      completionReceiptsKey(ADA.id),
      historySnapshotKey(ADA.id),
    ]) {
      expect(await AsyncStorage.getItem(`${key}/quarantine`)).toBe('{broken');
    }
  });
});
