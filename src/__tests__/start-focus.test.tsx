import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { NetworkError, type Topic } from '../api';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { makeTopic } from '../test-utils/topics';
import { sessionRulesKey } from '../focus/session-rules';
import { sessionOutboxKey } from '../sessions/session-outbox';
import { activeTimerKey } from '../timer/active-timer-store';
import type { TimerState } from '../timer/timer-engine';
import { scheduledNotifications } from '../test-utils/notifications-mock';
import { topicCreateQueueKey } from '../topics/topic-create-queue';
import { topicSnapshotKey, TopicSnapshotStore } from '../topics/topic-snapshot-store';

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));
// The native generator's jest mock returns nothing; the runtime's Web Crypto stands in.
jest.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

const mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

const API = 'https://api.example.com';
const USER = 'user-1';
const MINUTE = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The recent order (A2.8): Piano was used last, then Reading; Drawing was never used.
const piano = makeTopic({
  id: '6e2d4a6f-3b5c-4d7e-9f80-0b1c2d3e4f50',
  name: 'Piano',
  description: null,
  lastUsedAt: '2026-09-26T09:00:00.000Z',
  lastPlannedMinutes: 35,
});
const reading = makeTopic({
  id: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
  name: 'Reading',
  description: null,
  lastUsedAt: '2026-09-25T09:00:00.000Z',
  lastPlannedMinutes: 25,
});
const drawing = makeTopic({
  id: '7f3e5b70-4c6d-4e8f-a091-1c2d3e4f5061',
  name: 'Drawing',
  description: null,
  lastUsedAt: null,
  lastPlannedMinutes: null,
});

type Reply = { status: number; body?: unknown } | Error;

/**
 * The API as the Start Focus flow uses it: preferences, the recent topics (A2.8, in the order
 * given), topic creates (A2.2), and the session rules (GET /session-rules). `offline` fails
 * every request after preferences; `rules` may be changed between requests.
 */
function focusApi(recent: Topic[]) {
  const topics = [...recent];
  const state = {
    offline: false,
    rules: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } as unknown,
    rulesReply: null as Promise<Reply> | null,
  };
  const handler = ({ url, method, body }: FakeRequest): Reply | Promise<Reply> => {
    const { pathname } = new URL(url);
    // Reduced motion: the Focus screen's progress ring shows each value at once instead of
    // animating on every tick after these tests land there.
    if (pathname === '/me/preferences')
      return { status: 200, body: makePreferences({ reducedMotion: true }) };
    if (state.offline) return new NetworkError();
    if (pathname === '/session-rules')
      return state.rulesReply ?? { status: 200, body: state.rules };
    if (pathname === '/me/topics' && method === 'GET') return { status: 200, body: topics };
    if (pathname.startsWith('/me/topics/') && method === 'PUT') {
      const id = pathname.split('/')[3] ?? '';
      const created = makeTopic({
        id,
        ...(body as object),
        lastUsedAt: null,
        lastPlannedMinutes: null,
      });
      topics.push(created);
      return { status: 201, body: created };
    }
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
  return { handler, state, topics };
}

let requests: FakeRequest[];
let server: ReturnType<typeof focusApi>;

function serve(handler: (request: FakeRequest) => Reply | Promise<Reply>) {
  const net = fakeFetch(handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
}

const originalFetch = globalThis.fetch;
const setItem = AsyncStorage.setItem as jest.Mock;
const originalSetItem = setItem.getMockImplementation();
beforeEach(async () => {
  setItem.mockImplementation(originalSetItem);
  process.env.EXPO_PUBLIC_API_URL = API;
  mockWindow.fontScale = 1;
  await AsyncStorage.clear();
  signInForTest();
  server = focusApi([piano, reading, drawing]);
  serve(server.handler);
});
afterEach(async () => {
  await settleSheetTransitions();
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const storedTimer = async () => {
  const raw = await AsyncStorage.getItem(activeTimerKey(USER));
  return raw === null ? null : (JSON.parse(raw) as TimerState);
};
const topicRow = (name: string) => screen.findByRole('button', { name: new RegExp(`^${name}\\b`) });
const rulesRequests = () => requests.filter((r) => r.url === `${API}/session-rules`);

let app: ReturnType<typeof renderApp> | null = null;
async function openHome() {
  app = renderApp(appRoutes, { initialUrl: '/' });
  return screen.findByRole('button', { name: 'Start Focus' });
}

/** Home → Start Focus, then waits until the rules and topics are in. */
async function openPicker() {
  fireEvent.press(await openHome());
  await screen.findByText('Choose a topic');
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /^Reading\b/ }).props.accessibilityState,
    ).toMatchObject({ disabled: false }),
  );
}

/** Waits until a sheet with this title has left (its exit transition ran inside act). */
const gone = (title: string) => until(() => screen.queryByText(title) === null);

async function expectFocusScreen() {
  expect(await screen.findByRole('button', { name: 'Time left' })).toBeOnTheScreen();
  await gone('Choose a topic');
  await gone('Duration');
}

/** Waits for the duration choice, once the topic choice has left. */
async function expectDurationSheet() {
  expect(await screen.findByText('Duration')).toBeOnTheScreen();
  await gone('Choose a topic');
}

function timerState(overrides: Partial<TimerState>): TimerState {
  return {
    version: 1,
    id: '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
    topicId: reading.id,
    plannedMinutes: 25,
    rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
    startedAt: Date.now() - 2 * MINUTE,
    pauses: [],
    pausedAt: null,
    finished: null,
    ...overrides,
  };
}

describe('Start Focus from Home', () => {
  it('starts a recent topic with its remembered duration in two taps', async () => {
    fireEvent.press(await openHome());
    fireEvent.press(await topicRow('Reading'));

    await expectFocusScreen();
    const timer = await storedTimer();
    expect(timer).toMatchObject({
      topicId: reading.id,
      plannedMinutes: 25,
      rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
      finished: null,
      pausedAt: null,
    });
    expect(timer?.id).toMatch(UUID);
    expect(screen.queryByText('Duration')).toBeNull();
  });

  it('starts a remembered custom duration the same way', async () => {
    await openPicker();
    fireEvent.press(await topicRow('Piano'));
    await expectFocusScreen();
    expect(await storedTimer()).toMatchObject({ topicId: piano.id, plannedMinutes: 35 });
  });

  it('lists the recent topics in the server order, each with its duration', async () => {
    await openPicker();
    const names = screen
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel as string)
      .filter((label) => /^(Piano|Reading|Drawing)\b/.test(label));
    expect(names).toEqual(['Piano, 35 min', 'Reading, 25 min', 'Drawing']);
  });

  it('asks for a duration first when the topic has none, starting from 15', async () => {
    await openPicker();
    fireEvent.press(await topicRow('Drawing'));

    await expectDurationSheet();
    expect(screen.getByRole('button', { name: '15 min' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(await storedTimer()).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Start focus' }));
    await expectFocusScreen();
    expect(await storedTimer()).toMatchObject({ topicId: drawing.id, plannedMinutes: 15 });
  });

  it('lets another duration be chosen for this session only', async () => {
    await openPicker();
    fireEvent.press(screen.getByRole('button', { name: 'Change duration for Reading' }));
    await expectDurationSheet();
    expect(screen.getByRole('button', { name: '25 min' }).props.accessibilityState).toMatchObject({
      selected: true,
    });

    fireEvent.press(screen.getByRole('button', { name: '45 min' }));
    fireEvent.press(screen.getByRole('button', { name: 'Start focus' }));

    await expectFocusScreen();
    expect(await storedTimer()).toMatchObject({ topicId: reading.id, plannedMinutes: 45 });
    // Only the server remembers durations, from synced sessions: nothing about topics changed.
    expect(requests.filter((r) => r.url.includes('/me/topics/'))).toHaveLength(0);
    const saved = JSON.parse((await AsyncStorage.getItem(topicSnapshotKey(USER))) ?? '{}');
    const savedReading = (saved.lists?.['active:recent']?.topics as Topic[] | undefined)?.find(
      (topic) => topic.id === reading.id,
    );
    expect(savedReading?.lastPlannedMinutes).toBe(25);
  });
});

describe('the session rules', () => {
  it('are read from GET /session-rules and copied into the timer, which later rules never change', async () => {
    server.state.rules = { version: 2, minValidMinutes: 10, maxPauseMinutes: 20 };
    await openPicker();
    fireEvent.press(await topicRow('Reading'));
    await expectFocusScreen();
    expect((await storedTimer())?.rules).toEqual({ minValidMinutes: 10, maxPauseMinutes: 20 });

    // A later launch reads newer rules; the running timer keeps the ones it started with.
    server.state.rules = { version: 3, minValidMinutes: 15, maxPauseMinutes: 45 };
    app?.unmount();
    const before = rulesRequests().length;
    app = renderApp(appRoutes, { initialUrl: '/' });
    expect(await screen.findByRole('button', { name: 'Resume focus' })).toBeOnTheScreen();
    await waitFor(() => expect(rulesRequests().length).toBeGreaterThan(before));
    await waitFor(async () =>
      expect(JSON.parse((await AsyncStorage.getItem(sessionRulesKey)) ?? '{}').rules?.version).toBe(
        3,
      ),
    );
    expect((await storedTimer())?.rules).toEqual({ minValidMinutes: 10, maxPauseMinutes: 20 });
  });

  it('never quick-starts a remembered duration below the current minimum', async () => {
    server.state.rules = { version: 2, minValidMinutes: 30, maxPauseMinutes: 30 };
    fireEvent.press(await openHome());
    fireEvent.press(await topicRow('Reading'));

    await expectDurationSheet();
    expect(await storedTimer()).toBeNull();
    expect(screen.getByRole('button', { name: '25 min' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByRole('button', { name: '45 min' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('opens a topic without a duration on the first preset that meets a higher minimum', async () => {
    server.state.rules = { version: 2, minValidMinutes: 20, maxPauseMinutes: 30 };
    fireEvent.press(await openHome());
    fireEvent.press(await topicRow('Drawing'));

    await expectDurationSheet();
    expect(screen.getByRole('button', { name: '15 min' }).props.accessibilityState).toMatchObject({
      disabled: true,
      selected: false,
    });
    expect(screen.getByRole('button', { name: '25 min' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('cannot start anything when the minimum is longer than any duration on offer', async () => {
    server.state.rules = { version: 2, minValidMinutes: 181, maxPauseMinutes: 30 };
    fireEvent.press(await openHome());

    expect(
      await screen.findByText("Focus durations aren't available with the current settings."),
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: /^Reading\b/ }));
    expect(screen.queryByText('Duration')).toBeNull();
    expect(await storedTimer()).toBeNull();
  });

  it('keeps topics unavailable while the rules are loading', async () => {
    let answer!: (reply: Reply) => void;
    server.state.rulesReply = new Promise<Reply>((resolve) => (answer = resolve));
    fireEvent.press(await openHome());

    const row = await topicRow('Reading');
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(row);
    expect(await storedTimer()).toBeNull();

    answer({ status: 200, body: server.state.rules });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Reading\b/ }).props.accessibilityState,
      ).toMatchObject({ disabled: false }),
    );
  });

  it('never starts with made-up rules when none were ever loaded', async () => {
    server.state.rules = { minValidMinutes: 5 };
    fireEvent.press(await openHome());

    expect(
      await screen.findByText(
        "Focus settings aren't available right now.",
        {},
        { timeout: 10_000 },
      ),
    ).toBeOnTheScreen();
    fireEvent.press(await topicRow('Reading'));
    expect(await storedTimer()).toBeNull();
  });

  it('starts offline after a cold launch with the rules and topics saved on the device', async () => {
    await AsyncStorage.setItem(
      sessionRulesKey,
      JSON.stringify({
        version: 1,
        rules: { version: 4, minValidMinutes: 5, maxPauseMinutes: 25 },
      }),
    );
    const topics = new TopicSnapshotStore({ storage: AsyncStorage, report: () => undefined });
    await topics.activate(USER);
    await topics.save(USER, { status: 'active', sort: 'recent' }, [piano, reading], Date.now());
    server.state.offline = true;

    fireEvent.press(await openHome());
    fireEvent.press(await topicRow('Reading'));

    await expectFocusScreen();
    expect(await storedTimer()).toMatchObject({
      topicId: reading.id,
      plannedMinutes: 25,
      rules: { minValidMinutes: 5, maxPauseMinutes: 25 },
    });
  });

  it("uses the server's current rules over the saved ones once it has answered", async () => {
    await AsyncStorage.setItem(
      sessionRulesKey,
      JSON.stringify({
        version: 1,
        rules: { version: 4, minValidMinutes: 5, maxPauseMinutes: 25 },
      }),
    );
    server.state.rules = { version: 5, minValidMinutes: 10, maxPauseMinutes: 20 };
    await openPicker();
    await waitFor(async () =>
      expect(JSON.parse((await AsyncStorage.getItem(sessionRulesKey)) ?? '{}').rules?.version).toBe(
        5,
      ),
    );

    fireEvent.press(await topicRow('Reading'));

    await expectFocusScreen();
    expect((await storedTimer())?.rules).toEqual({ minValidMinutes: 10, maxPauseMinutes: 20 });
  });

  it('saves the rules the server answered, for the next offline launch', async () => {
    await openPicker();
    expect(JSON.parse((await AsyncStorage.getItem(sessionRulesKey)) ?? 'null')).toEqual({
      version: 1,
      rules: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 },
    });
  });
});

describe('topics waiting to sync', () => {
  it('start with the topic’s own id once a duration is chosen, without waiting for the sync', async () => {
    const pendingId = 'aaaaaaaa-0000-4000-8000-00000000000a';
    await AsyncStorage.setItem(
      topicCreateQueueKey(USER),
      JSON.stringify({
        version: 1,
        items: [
          {
            id: pendingId,
            payload: {
              name: 'Sketching',
              icon: 'topic.default',
              color: 'topic.1',
              description: null,
            },
            state: 'pending',
            attempted: true,
            queuedAt: 1,
          },
        ],
      }),
    );
    // Topic creates cannot reach the server; the lists and rules can.
    const base = server.handler;
    serve((request) => (request.method === 'PUT' ? new NetworkError() : base(request)));
    await openPicker();

    fireEvent.press(await screen.findByRole('button', { name: 'Sketching, Waiting to sync' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Start focus' }));

    await expectFocusScreen();
    expect(await storedTimer()).toMatchObject({ topicId: pendingId, plannedMinutes: 15 });
  });
});

describe('creating a topic from Start Focus', () => {
  it('offers a create when there are no topics, and the new topic can be started', async () => {
    server = focusApi([]);
    serve(server.handler);
    fireEvent.press(await openHome());

    fireEvent.press(await screen.findByRole('button', { name: 'Create topic' }));
    fireEvent.changeText(await screen.findByLabelText('Name'), 'Guitar');
    fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    await until(() => screen.queryByLabelText('Name') === null);

    fireEvent.press(await topicRow('Guitar'));
    fireEvent.press(await screen.findByRole('button', { name: 'Start focus' }));
    await expectFocusScreen();
    expect((await storedTimer())?.plannedMinutes).toBe(15);
  });
});

describe('a timer that could not be stored', () => {
  it('stays on the picker and says so calmly; nothing opens', async () => {
    await openPicker();
    setItem.mockImplementation(async (key: string, value: string) => {
      if (key === activeTimerKey(USER)) throw new Error('disk full');
      return originalSetItem?.(key, value);
    });

    fireEvent.press(await topicRow('Reading'));

    expect(
      await screen.findByText("We couldn't start this focus session on your device."),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Focus' })).toBeNull();
    expect(await storedTimer()).toBeNull();
  });
});

describe('a timer that already exists', () => {
  it.each([
    ['running', timerState({})],
    ['paused', timerState({ pausedAt: Date.now() - MINUTE })],
  ])('reopens a %s timer instead of starting another', async (_mode, existing) => {
    await AsyncStorage.setItem(activeTimerKey(USER), JSON.stringify(existing));
    app = renderApp(appRoutes, { initialUrl: '/' });

    fireEvent.press(await screen.findByRole('button', { name: 'Resume focus' }));

    await expectFocusScreen();
    expect(screen.queryByText('Choose a topic')).toBeNull();
    expect(await storedTimer()).toEqual(existing);
  });

  it('starts nothing while a finished session cannot be moved to the outbox', async () => {
    const finished = timerState({
      startedAt: Date.now() - 30 * MINUTE,
      finished: { at: Date.now() - 5 * MINUTE, reason: 'completed' },
    });
    await AsyncStorage.setItem(activeTimerKey(USER), JSON.stringify(finished));
    setItem.mockImplementation(async (key: string, value: string) => {
      if (key === sessionOutboxKey(USER)) throw new Error('disk full');
      return originalSetItem?.(key, value);
    });

    fireEvent.press(await openHome());

    expect(
      await screen.findByText('Your last session is still being saved on this device.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Choose a topic')).toBeNull();
    expect(await storedTimer()).toEqual(finished);
  });
});

describe('at 200% text', () => {
  it('keeps every topic, duration, and action', async () => {
    mockWindow.fontScale = 2;
    await openPicker();
    for (const name of ['Piano, 35 min', 'Reading, 25 min', 'Drawing']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: 'Change duration for Reading' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Change duration for Piano' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'New topic' })).toBeOnTheScreen();
  });
});

describe('the completion notification', () => {
  const os = () =>
    jest.requireMock('expo-notifications') as {
      getPermissionsAsync: jest.Mock;
      requestPermissionsAsync: jest.Mock;
    };

  it('asks for permission when the first session starts, not before, and schedules it at C', async () => {
    await openHome();
    expect(os().requestPermissionsAsync).not.toHaveBeenCalled();

    fireEvent.press(await screen.findByRole('button', { name: 'Start Focus' }));
    fireEvent.press(await topicRow('Reading'));
    await expectFocusScreen();
    const timer = await storedTimer();

    await waitFor(() => expect(scheduledNotifications()).toHaveLength(1));
    expect(os().requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(scheduledNotifications()[0]).toMatchObject({
      identifier: `focus-timer.${timer!.id}`,
      trigger: { date: timer!.startedAt + 25 * MINUTE },
    });
  });

  it('never holds the session back when notifications are refused', async () => {
    os().getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false });

    fireEvent.press(await openHome());
    fireEvent.press(await topicRow('Reading'));

    await expectFocusScreen();
    expect(await storedTimer()).toMatchObject({ topicId: reading.id, plannedMinutes: 25 });
    expect(os().requestPermissionsAsync).not.toHaveBeenCalled();
    expect(scheduledNotifications()).toEqual([]);
  });
});
