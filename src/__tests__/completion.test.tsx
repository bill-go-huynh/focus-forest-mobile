import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';

import { NetworkError, type FocusSession, type Topic } from '../api';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { mockAppState } from '../test-utils/app-state';
import {
  launchFromNotification,
  scheduledNotifications,
  tapNotification,
} from '../test-utils/notifications-mock';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { makeSessionResult } from '../test-utils/sessions';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { quarantineKeyOf } from '../common/stored-json';
import { makeTopic } from '../test-utils/topics';
import { completionReceiptsKey } from '../sessions/completion-receipts';
import { sessionNoteOutboxKey } from '../sessions/session-note-outbox';
import { sessionOutboxKey, type QueuedSession } from '../sessions/session-outbox';
import { activeTimerKey } from '../timer/active-timer-store';
import { deviceClock } from '../timer/app-timer-store';
import type { TimerState } from '../timer/timer-engine';
import { TopicSnapshotStore } from '../topics/topic-snapshot-store';

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
const USER = 'user-1';
const OTHER_USER = 'user-2';
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const SESSION_ID = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6';

const reading: Topic = makeTopic({
  id: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
  name: 'Reading',
  description: null,
  lastUsedAt: '2026-09-25T09:00:00.000Z',
  lastPlannedMinutes: 25,
});

/**
 * The API for the end of the loop: PUT /me/sessions/:id stores a session (a replay answers the
 * stored one, note included, as A2.5 does) and PATCH …/note sets its note (A2.6). `offline`
 * fails every session and note request; `answer` shapes what the server evaluated.
 */
function sessionApi() {
  const sessions = new Map<string, FocusSession>();
  const state = {
    offline: false,
    answer: {} as Partial<FocusSession>,
    loseNextNoteAnswer: false,
    loseNextSessionAnswer: false,
  };
  const handler = ({ url, method, body }: FakeRequest) => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences')
      return { status: 200, body: makePreferences({ reducedMotion: true }) };
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics') return { status: 200, body: [reading] };
    const [, , resource, id = '', tail] = pathname.split('/');
    if (resource === 'sessions') {
      if (state.offline) return new NetworkError();
      if (method === 'PUT') {
        const earlier = sessions.get(id);
        if (earlier) return { status: 200, body: earlier };
        const payload = body as { topicId: string; startedAt: string; endedAt: string };
        const stored = makeSessionResult({
          id,
          topicId: payload.topicId,
          startedAt: payload.startedAt,
          endedAt: payload.endedAt,
          note: null,
          ...state.answer,
        });
        sessions.set(id, stored);
        if (state.loseNextSessionAnswer) {
          state.loseNextSessionAnswer = false;
          return new NetworkError();
        }
        return { status: 201, body: stored };
      }
      if (method === 'PATCH' && tail === 'note') {
        const earlier = sessions.get(id);
        if (!earlier) return { status: 404, body: nestError(404, 'Session not found.') };
        const updated = { ...earlier, note: (body as { note: string | null }).note };
        sessions.set(id, updated);
        if (state.loseNextNoteAnswer) {
          state.loseNextNoteAnswer = false;
          return new NetworkError();
        }
        return { status: 200, body: updated };
      }
    }
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
  return { handler, sessions, state };
}

let clock = 0;
let T0 = 0;
let server: ReturnType<typeof sessionApi>;
let requests: FakeRequest[];
let appState: ReturnType<typeof mockAppState>;

const setItem = AsyncStorage.setItem as jest.Mock;
const originalSetItem = setItem.getMockImplementation();
const originalFetch = globalThis.fetch;

function serve() {
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
}

beforeEach(async () => {
  setItem.mockImplementation(originalSetItem);
  process.env.EXPO_PUBLIC_API_URL = API;
  mockWindow.fontScale = 1;
  await AsyncStorage.clear();
  signInForTest();
  server = sessionApi();
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

function timerState(overrides: Partial<TimerState> = {}): TimerState {
  return {
    version: 1,
    id: SESSION_ID,
    topicId: reading.id,
    plannedMinutes: 25,
    rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
    startedAt: T0,
    pauses: [],
    pausedAt: null,
    finished: null,
    ...overrides,
  };
}
async function storeTimer(timer: TimerState) {
  await AsyncStorage.setItem(activeTimerKey(USER), JSON.stringify(timer));
}
async function storedTimer(): Promise<TimerState | null> {
  const raw = await AsyncStorage.getItem(activeTimerKey(USER));
  return raw === null ? null : (JSON.parse(raw) as TimerState);
}
async function outboxItems(): Promise<QueuedSession[]> {
  const raw = await AsyncStorage.getItem(sessionOutboxKey(USER));
  return raw === null ? [] : (JSON.parse(raw) as { items: QueuedSession[] }).items;
}
async function noteItems(userId = USER): Promise<{ sessionId: string; note: string | null }[]> {
  const raw = await AsyncStorage.getItem(sessionNoteOutboxKey(userId));
  return raw === null ? [] : (JSON.parse(raw) as { items: never[] }).items;
}
async function saveTopics() {
  const store = new TopicSnapshotStore({ storage: AsyncStorage, report: () => undefined });
  await store.activate(USER);
  await store.save(USER, { status: 'active', sort: 'recent' }, [reading], clock);
}
/** A session the timer ended in an earlier process, ended early at 12 minutes. */
const endedEarly = () => timerState({ finished: { at: T0 + 12 * MINUTE, reason: 'ended' } });

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
const sessionCalls = (method: string) =>
  requests.filter((r) => r.method === method && r.url.includes('/me/sessions/'));
const noteInput = () => screen.getByLabelText('Note');
const tapData = (userId = USER, event = 'completion') => ({
  kind: 'focus-timer',
  userId,
  sessionId: SESSION_ID,
  event,
  at: T0 + 25 * MINUTE,
  sound: true,
});

describe('a session that ends while the app is open on Home', () => {
  it('is stored at its instant C without any tap, handed off, and its completion opens', async () => {
    await saveTopics();
    server.state.answer = { status: 'completed' };
    // C is one second away on the real clock, so the foreground wake-up fires in this test.
    await storeTimer(timerState({ startedAt: T0 - 25 * MINUTE + SECOND }));
    renderApp(appRoutes, { initialUrl: '/' });
    expect(await screen.findByRole('button', { name: 'Resume focus' })).toBeOnTheScreen();

    clock = T0 + 5 * SECOND;
    await shows('Session complete');

    const put = sessionCalls('PUT')[0]!;
    expect((put.body as { endedAt: string }).endedAt).toBe(new Date(T0 + SECOND).toISOString());
    expect(await storedTimer()).toBeNull();
    // Nothing needed the OS: the notification was cancelled once the end was stored.
    expect(scheduledNotifications()).toEqual([]);
  });

  it('ends a pause that ran out at exactly L', async () => {
    await storeTimer(
      timerState({ startedAt: T0 - 40 * MINUTE, pausedAt: T0 - 30 * MINUTE + SECOND }),
    );
    server.state.offline = true;
    renderApp(appRoutes, { initialUrl: '/' });
    expect(await screen.findByRole('button', { name: 'Resume focus' })).toBeOnTheScreen();

    clock = T0 + 5 * SECOND;
    await shows('Focus session finished');

    const [item] = await outboxItems();
    expect(item?.payload.endedAt).toBe(new Date(T0 + SECOND).toISOString());
  });
});

describe('a session that ends while the app is in the background', () => {
  it('is not woken in the background: the return stores it, still at C', async () => {
    server.state.offline = true;
    await storeTimer(timerState({ startedAt: T0 - 25 * MINUTE + SECOND }));
    renderApp(appRoutes, { initialUrl: '/' });
    expect(await screen.findByRole('button', { name: 'Resume focus' })).toBeOnTheScreen();

    await appState.emit('background');
    clock = T0 + 5 * SECOND;
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 2000)));
    expect((await storedTimer())?.finished).toBeNull();

    await appState.emit('active');
    await until(() => sessionCalls('PUT').length > 0);
    expect((await outboxItems())[0]?.payload.endedAt).toBe(new Date(T0 + SECOND).toISOString());
  });
});

describe('Focus opening its completion', () => {
  it('replaces Focus, so Done returns Home', async () => {
    server.state.answer = { status: 'completed' };
    await storeTimer(timerState());
    renderApp(appRoutes, { initialUrl: '/' });
    fireEvent.press(await screen.findByRole('button', { name: 'Resume focus' }));
    await screen.findByRole('button', { name: 'Time left' });

    clock = T0 + 26 * MINUTE;
    await shows('Session complete');
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByRole('button', { name: 'Start Focus' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Time left' })).toBeNull();
  });
});

describe('the completion of a session not yet on the server', () => {
  it('shows what the device knows: the topic and the focused time, without an outcome', async () => {
    await saveTopics();
    await storeTimer(endedEarly());
    server.state.offline = true;

    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });

    expect(await screen.findByRole('header', { name: 'Focus session finished' })).toBeOnTheScreen();
    expect(screen.getByText('Reading')).toBeOnTheScreen();
    expect(screen.getByText('12 min focused')).toBeOnTheScreen();
    expect(screen.getByText('Saved on this device.')).toBeOnTheScreen();
    expect(screen.queryByText(/count|complete|fail|lost|wast|streak/i)).toBeNull();
  });

  it('lets the user leave while offline', async () => {
    await storeTimer(endedEarly());
    server.state.offline = true;
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    await screen.findByRole('header', { name: 'Focus session finished' });

    fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByRole('button', { name: 'Start Focus' })).toBeOnTheScreen();
  });

  it('says so calmly when the device does not have the session', async () => {
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });

    expect(await screen.findByText("This session isn't on this device.")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));
    expect(await screen.findByRole('button', { name: 'Start Focus' })).toBeOnTheScreen();
  });
});

describe('the server’s answer', () => {
  it.each<[FocusSession['status'], string, string | null]>([
    ['completed', 'Session complete', null],
    ['ended_early', 'Focus session saved', null],
    [
      'discarded',
      'Focus session saved',
      'This session was shorter than the current minimum for counted focus time.',
    ],
  ])('shows a %s session as the server evaluated it', async (status, title, detail) => {
    await storeTimer(endedEarly());
    server.state.answer = {
      status,
      counted: status !== 'discarded',
      focusedMilliseconds: 9 * MINUTE,
    };

    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });

    expect(await screen.findByRole('header', { name: title })).toBeOnTheScreen();
    // The server's focused time, not the device's 12 minutes.
    expect(screen.getByText('9 min focused')).toBeOnTheScreen();
    if (detail) expect(screen.getByText(detail)).toBeOnTheScreen();
    expect(screen.queryByText('Saved on this device.')).toBeNull();
  });

  it('upgrades the screen in place when the session syncs, keeping the note being typed', async () => {
    await storeTimer(endedEarly());
    server.state.offline = true;
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    await screen.findByRole('header', { name: 'Focus session finished' });
    fireEvent.changeText(noteInput(), 'half typed');
    // The launch's attempt has failed and finished before the connection returns.
    await until(() => sessionCalls('PUT').length === 1);
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 100)));

    server.state.offline = false;
    await appState.emit('background');
    await appState.emit('active');

    expect(await screen.findByRole('header', { name: 'Focus session saved' })).toBeOnTheScreen();
    expect(noteInput().props.value).toBe('half typed');
  });
});

describe('the note', () => {
  it('is kept on the device while offline, and sent only after the session is on the server', async () => {
    await storeTimer(endedEarly());
    server.state.offline = true;
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    await screen.findByRole('header', { name: 'Focus session finished' });

    fireEvent.changeText(noteInput(), '  Chapter 4\n\nthen notes  ');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));

    expect(await screen.findByText('Note saved on this device.')).toBeOnTheScreen();
    expect(await noteItems()).toEqual([
      expect.objectContaining({ sessionId: SESSION_ID, note: 'Chapter 4\n\nthen notes' }),
    ]);
    expect(sessionCalls('PATCH')).toEqual([]);

    // Back online: the session first, then its note.
    server.state.offline = false;
    await appState.emit('background');
    await appState.emit('active');
    await until(() => sessionCalls('PATCH').length === 1);

    const order = requests
      .filter((r) => r.url.includes('/me/sessions/'))
      .map((r) => r.method)
      .filter((method, i, all) => all.indexOf(method) === i);
    expect(order).toEqual(['PUT', 'PATCH']);
    expect(server.sessions.get(SESSION_ID)?.note).toBe('Chapter 4\n\nthen notes');
    // The note is never part of the session's submission.
    expect(sessionCalls('PUT').every((r) => !('note' in (r.body as object)))).toBe(true);
    await until(() => screen.queryByText('Note saved.') !== null);
    expect(await noteItems()).toEqual([]);
  });

  it('survives Done and a relaunch while offline, then syncs', async () => {
    await storeTimer(endedEarly());
    server.state.offline = true;
    const first = renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    await screen.findByRole('header', { name: 'Focus session finished' });
    fireEvent.changeText(noteInput(), 'Chapter 4');

    // Done saves the note on the device and leaves at once, without the network.
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: 'Start Focus' })).toBeOnTheScreen();
    expect(await noteItems()).toEqual([expect.objectContaining({ note: 'Chapter 4' })]);
    first.unmount();

    server.state.offline = false;
    renderApp(appRoutes, { initialUrl: '/' });
    await until(() => server.sessions.get(SESSION_ID)?.note === 'Chapter 4');
    await until(() => sessionCalls('PATCH').length === 1);
    expect(await noteItems()).toEqual([]);
  });

  it('is sent again when its answer was lost, and cleared once answered', async () => {
    await storeTimer(endedEarly());
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    await screen.findByRole('header', { name: 'Focus session saved' });
    server.state.loseNextNoteAnswer = true;

    fireEvent.changeText(noteInput(), 'Chapter 4');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));
    await until(() => sessionCalls('PATCH').length === 1);
    expect(await noteItems()).toHaveLength(1);

    await appState.emit('background');
    await appState.emit('active');
    await until(() => sessionCalls('PATCH').length === 2);
    await until(() => screen.queryByText('Note saved.') !== null);
    expect(sessionCalls('PATCH').map((r) => r.body)).toEqual([
      { note: 'Chapter 4' },
      { note: 'Chapter 4' },
    ]);
    expect(await noteItems()).toEqual([]);
  });

  it('waits for the replayed session after a lost answer, and the replay never resets it', async () => {
    await storeTimer(endedEarly());
    // The server stores the session, but its answer never arrives.
    server.state.loseNextSessionAnswer = true;
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    await screen.findByRole('header', { name: 'Focus session finished' });
    await until(() => server.sessions.has(SESSION_ID));

    fireEvent.changeText(noteInput(), 'Chapter 4');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));
    await screen.findByText('Note saved on this device.');
    // Still queued on the device: no note yet.
    expect(sessionCalls('PATCH')).toEqual([]);

    await appState.emit('background');
    await appState.emit('active');
    await until(() => screen.queryByText('Note saved.') !== null);

    const methods = requests.filter((r) => r.url.includes('/me/sessions/')).map((r) => r.method);
    expect(methods).toEqual(['PUT', 'PUT', 'PATCH']);
    expect(server.sessions.get(SESSION_ID)?.note).toBe('Chapter 4');
    expect(noteInput().props.value).toBe('Chapter 4');
  });

  it('shows a later edit waiting offline, not the note the server confirmed before it', async () => {
    await storeTimer(endedEarly());
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    await screen.findByRole('header', { name: 'Focus session saved' });
    fireEvent.changeText(noteInput(), 'first');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));
    await until(() => screen.queryByText('Note saved.') !== null);

    server.state.offline = true;
    fireEvent.changeText(noteInput(), 'second');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));

    expect(await screen.findByText('Note saved on this device.')).toBeOnTheScreen();
    expect(noteInput().props.value).toBe('second');
    expect(server.sessions.get(SESSION_ID)?.note).toBe('first');
  });

  it('refuses more than 500 characters, counting an emoji as one', async () => {
    await storeTimer(endedEarly());
    server.state.offline = true;
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    await screen.findByRole('header', { name: 'Focus session finished' });

    fireEvent.changeText(noteInput(), '🌱'.repeat(500));
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Note saved on this device.')).toBeOnTheScreen();

    fireEvent.changeText(noteInput(), '🌱'.repeat(501));
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('A note can be at most 500 characters.')).toBeOnTheScreen();
    expect((await noteItems())[0]?.note).toBe('🌱'.repeat(500));
  });

  it('can be cleared', async () => {
    await storeTimer(endedEarly());
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    await screen.findByRole('header', { name: 'Focus session saved' });
    fireEvent.changeText(noteInput(), 'Chapter 4');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));
    await until(() => server.sessions.get(SESSION_ID)?.note === 'Chapter 4');

    fireEvent.changeText(noteInput(), '   ');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));

    await until(() => server.sessions.get(SESSION_ID)?.note === null);
  });
});

describe('a tap on the notification', () => {
  it('opens the completion of the tapped session after a cold launch, once it is ready', async () => {
    // Killed while running; the plan ran out; the OS notification launches the app.
    await storeTimer(timerState());
    clock = T0 + 30 * MINUTE;
    server.state.answer = { status: 'completed' };
    launchFromNotification(tapData());

    renderApp(appRoutes, { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Session complete' })).toBeOnTheScreen();
    expect(await outboxItems()).toHaveLength(0);
    expect(server.sessions.get(SESSION_ID)?.endedAt).toBe(new Date(T0 + 25 * MINUTE).toISOString());
  });

  it('shows what the session says, not what the notification said', async () => {
    await storeTimer(timerState({ pausedAt: T0 + 5 * MINUTE }));
    clock = T0 + 90 * MINUTE;
    server.state.answer = { status: 'ended_early', focusedMilliseconds: 5 * MINUTE };
    launchFromNotification(tapData(USER, 'completion'));

    renderApp(appRoutes, { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Focus session saved' })).toBeOnTheScreen();
    expect(screen.getByText('5 min focused')).toBeOnTheScreen();
  });

  it('never opens another user’s session', async () => {
    await storeTimer(endedEarly());
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: 'Start Focus' });

    await act(async () => tapNotification(tapData(OTHER_USER)));
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));

    expect(screen.queryByRole('header', { name: /Focus session|Session complete/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Start Focus' })).toBeOnTheScreen();
  });

  it('opens one completion however many times it is tapped', async () => {
    await storeTimer(endedEarly());
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: 'Start Focus' });

    await act(async () => tapNotification(tapData()));
    await screen.findByRole('header', { name: 'Focus session saved' });
    await act(async () => tapNotification(tapData()));
    await act(async () => tapNotification(tapData()));
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));

    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: 'Start Focus' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Focus session saved' })).toBeNull();
  });
});

describe('a session synced by an earlier process', () => {
  const MISSING = "This session isn't on this device.";
  async function storedReceipts(userId = USER): Promise<FocusSession[]> {
    const raw = await AsyncStorage.getItem(completionReceiptsKey(userId));
    return raw === null ? [] : (JSON.parse(raw) as { receipts: FocusSession[] }).receipts;
  }

  /**
   * Process one: the timer runs, the OS holds its notification, the app goes to the background,
   * comes back after C, and the session syncs. Then the process ends: its QueryClient, stores,
   * providers, and every answer it kept in memory are gone.
   */
  async function syncThenKill() {
    await saveTopics();
    server.state.answer = { status: 'completed', focusedMilliseconds: 25 * MINUTE };
    await storeTimer(timerState());
    clock = T0 + 10 * MINUTE;
    const first = renderApp(appRoutes, { initialUrl: '/' });
    expect(await screen.findByRole('button', { name: 'Resume focus' })).toBeOnTheScreen();
    await until(() => scheduledNotifications().length === 1);
    expect(JSON.stringify(scheduledNotifications())).toContain(SESSION_ID);

    await appState.emit('background');
    clock = T0 + 26 * MINUTE;
    await appState.emit('active');
    await until(() => server.sessions.has(SESSION_ID));
    await until(() => screen.queryByRole('header', { name: 'Session complete' }) !== null);
    await until(() => sessionCalls('PUT').length === 1);
    expect(await outboxItems()).toEqual([]);
    expect(await storedTimer()).toBeNull();
    return first;
  }

  /** Process two, cold-launched by a tap on the delivered notification. */
  function relaunchFromTap() {
    serve();
    launchFromNotification(tapData());
    return renderApp(appRoutes, { initialUrl: '/' });
  }

  it('opens from a tap after a cold launch, as the server answered it, with nothing re-sent', async () => {
    const first = await syncThenKill();
    first.unmount();

    relaunchFromTap();

    expect(await screen.findByRole('header', { name: 'Session complete' })).toBeOnTheScreen();
    expect(screen.getByText('25 min focused')).toBeOnTheScreen();
    expect(screen.getByText('Reading')).toBeOnTheScreen();
    expect(screen.queryByText(MISSING)).toBeNull();
    expect(screen.queryByText('Saved on this device.')).toBeNull();
    // Nothing was asked of the server: the device kept its answer.
    expect(sessionCalls('PUT')).toEqual([]);
  });

  it('shows the note the server confirmed before the kill', async () => {
    const first = await syncThenKill();
    fireEvent.changeText(noteInput(), 'Chapter 4');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));
    await until(() => screen.queryByText('Note saved.') !== null);
    expect((await storedReceipts())[0]?.note).toBe('Chapter 4');
    first.unmount();

    server.state.offline = true;
    relaunchFromTap();

    expect(await screen.findByRole('header', { name: 'Session complete' })).toBeOnTheScreen();
    expect(noteInput().props.value).toBe('Chapter 4');
    expect(screen.queryByText('Note saved on this device.')).toBeNull();
  });

  it('shows a newer note still waiting on the device over the one the server confirmed', async () => {
    const first = await syncThenKill();
    fireEvent.changeText(noteInput(), 'first');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));
    await until(() => screen.queryByText('Note saved.') !== null);
    server.state.offline = true;
    fireEvent.changeText(noteInput(), 'second');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));
    await screen.findByText('Note saved on this device.');
    first.unmount();

    relaunchFromTap();

    expect(await screen.findByRole('header', { name: 'Session complete' })).toBeOnTheScreen();
    expect(noteInput().props.value).toBe('second');
    expect(screen.getByText('Note saved on this device.')).toBeOnTheScreen();
    // The receipt holds only what the server confirmed.
    expect((await storedReceipts())[0]?.note).toBe('first');
  });

  it('waits for the receipts to be read before saying the session is missing', async () => {
    const first = await syncThenKill();
    first.unmount();
    const getItem = AsyncStorage.getItem as jest.Mock;
    const originalGetItem = getItem.getMockImplementation()!;
    getItem.mockImplementation(async (key: string) => {
      if (key === completionReceiptsKey(USER)) {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      }
      return originalGetItem(key);
    });
    let sawMissing = false;
    try {
      relaunchFromTap();
      await until(() => {
        if (screen.queryByText(MISSING) !== null) sawMissing = true;
        return screen.queryByRole('header', { name: 'Session complete' }) !== null;
      });
    } finally {
      getItem.mockImplementation(originalGetItem);
    }

    expect(sawMissing).toBe(false);
  });

  it("never shows another user's receipt", async () => {
    await AsyncStorage.setItem(
      completionReceiptsKey(OTHER_USER),
      JSON.stringify({ version: 1, receipts: [makeSessionResult({ id: SESSION_ID })] }),
    );

    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });

    expect(await screen.findByText(MISSING)).toBeOnTheScreen();
  });

  it('sets a corrupt receipt cache aside without touching the timer, the outbox, or notes', async () => {
    await AsyncStorage.setItem(completionReceiptsKey(USER), '{not json');
    await storeTimer(endedEarly());
    server.state.answer = { status: 'completed' };

    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });

    expect(await screen.findByRole('header', { name: 'Session complete' })).toBeOnTheScreen();
    expect(await outboxItems()).toEqual([]);
    expect(await AsyncStorage.getItem(quarantineKeyOf(completionReceiptsKey(USER)))).toBe(
      '{not json',
    );
    expect((await storedReceipts()).map((r) => r.id)).toEqual([SESSION_ID]);
    fireEvent.changeText(noteInput(), 'Chapter 4');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));
    await until(() => server.sessions.get(SESSION_ID)?.note === 'Chapter 4');
  });
});

describe('accessibility', () => {
  it('announces the outcome once, with a heading, the time, a labeled note, and Done', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    await storeTimer(endedEarly());
    server.state.answer = { status: 'completed', focusedMilliseconds: 25 * MINUTE };

    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });

    expect(await screen.findByRole('header', { name: 'Session complete' })).toBeOnTheScreen();
    expect(screen.getByText('25 min focused')).toBeOnTheScreen();
    expect(noteInput()).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Done' })).toBeOnTheScreen();
    await until(() =>
      announce.mock.calls.some(([m]) => m === 'Session complete. 25 minutes focused.'),
    );
  });

  it('keeps everything reachable at 200% text', async () => {
    mockWindow.fontScale = 2;
    await storeTimer(endedEarly());
    server.state.offline = true;

    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });

    expect(await screen.findByRole('header', { name: 'Focus session finished' })).toBeOnTheScreen();
    expect(noteInput()).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save note' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Done' })).toBeOnTheScreen();
    expect(screen.getByTestId('screen-scroll')).toBeOnTheScreen();
  });
});
