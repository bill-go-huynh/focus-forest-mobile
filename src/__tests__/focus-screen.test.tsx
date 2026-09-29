import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { AccessibilityInfo, Animated } from 'react-native';

import type { Topic } from '../api';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { mockAppState } from '../test-utils/app-state';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { makeTopic } from '../test-utils/topics';
import { sessionOutboxKey, type QueuedSession } from '../sessions/session-outbox';
import { activeTimerKey } from '../timer/active-timer-store';
import { deviceClock } from '../timer/app-timer-store';
import type { TimerState } from '../timer/timer-engine';
import { topicCreateQueueKey } from '../topics/topic-create-queue';
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
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const SESSION_ID = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6';

const reading = makeTopic({
  id: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
  name: 'Reading',
  icon: 'book',
  color: 'topic.3',
  description: null,
  lastUsedAt: '2026-09-25T09:00:00.000Z',
  lastPlannedMinutes: 25,
});

/**
 * The API as the Focus screen meets it: preferences, rules and recent topics for Home, and a
 * session endpoint that never answers, so a handed-off session stays in the outbox to be read.
 */
function handler({ url }: FakeRequest) {
  const { pathname } = new URL(url);
  // Reduced motion: the progress ring shows each value at once. Its motion has its own tests;
  // here it would restart every tick and run its frames between this file's steps.
  if (pathname === '/me/preferences')
    return { status: 200, body: makePreferences({ reducedMotion: !motion }) };
  if (pathname === '/session-rules')
    return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
  if (pathname === '/me/topics') return { status: 200, body: [reading] };
  return { status: 503, body: nestError(503, 'Not in this test.') };
}

/**
 * The timer's wall clock (the store's `now`, which the screen reads too). It moves only when a
 * test moves it, so a countdown that changed by itself would be counting, not deriving.
 * Everything else keeps real time.
 */
let clock = 0;
/** Motion on for the one test about the ring's animation; reduced everywhere else. */
let motion = false;
let T0 = 0;
let appState: ReturnType<typeof mockAppState>;

const setItem = AsyncStorage.setItem as jest.Mock;
const originalSetItem = setItem.getMockImplementation();
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  setItem.mockImplementation(originalSetItem);
  process.env.EXPO_PUBLIC_API_URL = API;
  mockWindow.fontScale = 1;
  await AsyncStorage.clear();
  signInForTest();
  globalThis.fetch = fakeFetch(handler).fetch;
  T0 = Date.now();
  clock = T0;
  motion = false;
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
async function saveTopics(topics: Topic[]) {
  const store = new TopicSnapshotStore({ storage: AsyncStorage, report: () => undefined });
  await store.activate(USER);
  await store.save(USER, { status: 'active', sort: 'recent' }, topics, clock);
}
function failWritesTo(key: string) {
  setItem.mockImplementation(async (name: string, value: string) => {
    if (name === key) throw new Error('disk full');
    return originalSetItem?.(name, value);
  });
}
const writeNormally = () => setItem.mockImplementation(originalSetItem);

const timeLeft = () => screen.findByRole('button', { name: 'Time left' });
const shows = (text: string) => until(() => screen.queryByText(text) !== null);
const sleep = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

/** Opens the Focus route directly, as a relaunch into it would. */
async function openFocus() {
  renderApp(appRoutes, { initialUrl: '/focus' });
  return timeLeft();
}

describe('the countdown', () => {
  it('shows the topic, the plan, and the time left derived from the wall clock', async () => {
    await saveTopics([reading]);
    await storeTimer(timerState({ startedAt: T0 - 2 * MINUTE }));

    await openFocus();

    expect(screen.getByRole('header', { name: 'Reading' })).toBeOnTheScreen();
    expect(
      screen.getByTestId('topic-mark-book', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.getByText('25 min session')).toBeOnTheScreen();
    expect(screen.getByText('23:00')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: 'Session progress' })).toHaveAccessibilityValue({
      text: '2 of 25 min',
    });
  });

  it('never counts down by itself: it moves only with the clock, and jumps with it', async () => {
    await storeTimer(timerState());
    await openFocus();
    expect(screen.getByText('25:00')).toBeOnTheScreen();

    // Several ticks pass while the wall clock stands still.
    await sleep(2500);
    expect(screen.getByText('25:00')).toBeOnTheScreen();

    // A late tick shows where the clock is, however many ticks were missed.
    clock = T0 + 7 * MINUTE + 30 * SECOND;
    await shows('17:30');
    clock = T0 + 7 * MINUTE + 31 * SECOND;
    await shows('17:29');
  });

  it('stores the completion at its instant, hands it off once, and shows the session is done', async () => {
    await storeTimer(timerState());
    await openFocus();

    clock = T0 + 25 * MINUTE + 3 * MINUTE;
    await shows('Focus session finished');

    const items = await outboxItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: SESSION_ID,
      payload: { endedAt: new Date(T0 + 25 * MINUTE).toISOString(), pauseIntervals: [] },
    });
    expect(await storedTimer()).toBeNull();
    expect(screen.getByText('25 min focused')).toBeOnTheScreen();
  });
});

describe('leaving the app and coming back', () => {
  it('shows the right time at once after minutes in the background', async () => {
    await storeTimer(timerState());
    await openFocus();

    await appState.emit('background');
    clock = T0 + 12 * MINUTE;
    await appState.emit('active');

    // At once: the clock is read again on the return, not at the next tick.
    expect(screen.getByText('13:00')).toBeOnTheScreen();
    expect(await storedTimer()).toEqual(timerState());
  });

  it('ends at the completion instant when the plan ran out in the background', async () => {
    await storeTimer(timerState());
    await openFocus();

    await appState.emit('background');
    clock = T0 + 90 * MINUTE;
    await appState.emit('active');

    await shows('Focus session finished');
    expect((await outboxItems())[0]?.payload.endedAt).toBe(
      new Date(T0 + 25 * MINUTE).toISOString(),
    );
  });

  it('ends a pause that ran past the limit in the background at the limit', async () => {
    await storeTimer(timerState({ pausedAt: T0 + 5 * MINUTE }));
    clock = T0 + 6 * MINUTE;
    await openFocus();

    await appState.emit('background');
    clock = T0 + 2 * 60 * MINUTE;
    await appState.emit('active');

    await shows('Focus session finished');
    const [item] = await outboxItems();
    const limit = new Date(T0 + 35 * MINUTE).toISOString();
    expect(item?.payload.endedAt).toBe(limit);
    expect(item?.payload.pauseIntervals).toEqual([
      { startedAt: new Date(T0 + 5 * MINUTE).toISOString(), endedAt: limit },
    ]);
  });
});

describe('pause and resume', () => {
  it('pauses once stored, holds the focus time still, and resumes from there', async () => {
    await storeTimer(timerState());
    await openFocus();
    clock = T0 + 5 * MINUTE;
    await shows('20:00');

    fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeOnTheScreen();
    expect(await storedTimer()).toMatchObject({ pausedAt: T0 + 5 * MINUTE });
    expect(screen.getByText('Paused')).toBeOnTheScreen();

    clock = T0 + 9 * MINUTE;
    await sleep(1500);
    expect(screen.getByText('20:00')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    expect(await storedTimer()).toMatchObject({
      pausedAt: null,
      pauses: [{ startedAt: T0 + 5 * MINUTE, endedAt: T0 + 9 * MINUTE }],
    });
    clock = T0 + 10 * MINUTE;
    await shows('19:00');
  });

  it('stays running when the pause cannot be stored, and says so calmly', async () => {
    await storeTimer(timerState());
    await openFocus();
    failWritesTo(activeTimerKey(USER));

    fireEvent.press(screen.getByRole('button', { name: 'Pause' }));

    expect(await screen.findByText("We couldn't pause on this device.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    expect(screen.queryByText('Paused')).toBeNull();
    expect(await storedTimer()).toEqual(timerState());
  });

  it('stays paused when the resume cannot be stored', async () => {
    const paused = timerState({ pausedAt: T0 + MINUTE });
    await storeTimer(paused);
    clock = T0 + 2 * MINUTE;
    await openFocus();
    failWritesTo(activeTimerKey(USER));

    fireEvent.press(screen.getByRole('button', { name: 'Resume' }));

    expect(await screen.findByText("We couldn't resume on this device.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeOnTheScreen();
    expect(await storedTimer()).toEqual(paused);
  });

  it('keeps the session as it is when the device clock went back, and says so plainly', async () => {
    const paused = timerState({ pausedAt: T0 + 10 * MINUTE });
    await storeTimer(paused);
    clock = T0 + 4 * MINUTE;
    await openFocus();

    fireEvent.press(screen.getByRole('button', { name: 'Resume' }));

    expect(await screen.findByText('Your device time changed.')).toBeOnTheScreen();
    expect(
      screen.getByText('Focus controls will be available when the clock catches up.'),
    ).toBeOnTheScreen();
    expect(await storedTimer()).toEqual(paused);
    expect(screen.getByText('15:00')).toBeOnTheScreen();
  });
});

describe('ending early', () => {
  const endButton = () => screen.getByRole('button', { name: 'End session' });
  const confirmTitle = 'End this focus session?';

  it('asks first, with calm and factual words; cancel changes nothing', async () => {
    const rules = { minValidMinutes: 10, maxPauseMinutes: 30 };
    await storeTimer(timerState({ rules }));
    await openFocus();

    fireEvent.press(endButton());

    expect(await screen.findByText(confirmTitle)).toBeOnTheScreen();
    // The minimum is the one the timer started with.
    expect(
      screen.getByText(
        'Your focused time so far will be saved. Sessions count once they reach 10 minutes.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/fail|lose|lost|wast|streak/i)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Keep focusing' }));
    await until(() => screen.queryByText(confirmTitle) === null);
    expect(await storedTimer()).toEqual(timerState({ rules }));
    expect(await outboxItems()).toEqual([]);
  });

  it('ends at the confirmation, hands the session off, and shows it ended', async () => {
    await storeTimer(timerState());
    await openFocus();
    clock = T0 + 3 * MINUTE;

    fireEvent.press(endButton());
    const confirm = await screen.findAllByRole('button', { name: 'End session' });
    fireEvent.press(confirm[confirm.length - 1]!);

    await shows('Focus session finished');
    expect(screen.getByText('3 min focused')).toBeOnTheScreen();
    expect((await outboxItems())[0]?.payload.endedAt).toBe(new Date(T0 + 3 * MINUTE).toISOString());
    expect(await storedTimer()).toBeNull();
  });

  it('records a completion reached while the question was open at its own instant', async () => {
    await storeTimer(timerState());
    await openFocus();
    fireEvent.press(endButton());
    const confirm = await screen.findAllByRole('button', { name: 'End session' });

    clock = T0 + 40 * MINUTE;
    fireEvent.press(confirm[confirm.length - 1]!);

    await shows('Focus session finished');
    expect((await outboxItems())[0]?.payload.endedAt).toBe(
      new Date(T0 + 25 * MINUTE).toISOString(),
    );
  });

  it('closes an open pause at the end', async () => {
    await storeTimer(timerState({ pausedAt: T0 + 5 * MINUTE }));
    clock = T0 + 8 * MINUTE;
    await openFocus();

    fireEvent.press(endButton());
    const confirm = await screen.findAllByRole('button', { name: 'End session' });
    fireEvent.press(confirm[confirm.length - 1]!);

    await shows('Focus session finished');
    expect((await outboxItems())[0]?.payload).toMatchObject({
      endedAt: new Date(T0 + 8 * MINUTE).toISOString(),
      pauseIntervals: [
        {
          startedAt: new Date(T0 + 5 * MINUTE).toISOString(),
          endedAt: new Date(T0 + 8 * MINUTE).toISOString(),
        },
      ],
    });
  });
});

describe('going back', () => {
  async function focusFromHome() {
    await storeTimer(timerState());
    renderApp(appRoutes, { initialUrl: '/' });
    fireEvent.press(await screen.findByRole('button', { name: 'Resume focus' }));
    return timeLeft();
  }

  it('never leaves a running session silently: it asks to end it, and cancel stays', async () => {
    await focusFromHome();

    act(() => router.back());

    expect(await screen.findByText('End this focus session?')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Keep focusing' }));
    await until(() => screen.queryByText('End this focus session?') === null);
    expect(screen.getByRole('button', { name: 'Time left' })).toBeOnTheScreen();
    expect(await storedTimer()).toEqual(timerState());
  });

  it('ends the session when that is confirmed, then Done returns Home', async () => {
    await focusFromHome();
    clock = T0 + 6 * MINUTE;

    act(() => router.back());
    const confirm = await screen.findAllByRole('button', { name: 'End session' });
    fireEvent.press(confirm[confirm.length - 1]!);

    await shows('Focus session finished');
    expect((await outboxItems())[0]?.payload.endedAt).toBe(new Date(T0 + 6 * MINUTE).toISOString());
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('button', { name: 'Start Focus' })).toBeOnTheScreen();
  });
});

describe('a session that already ended', () => {
  const ended = () =>
    timerState({
      startedAt: T0 - 40 * MINUTE,
      finished: { at: T0 - 15 * MINUTE, reason: 'completed' },
    });

  it('is handed off when Focus opens, never shown as running, never queued twice', async () => {
    await storeTimer(ended());

    renderApp(appRoutes, { initialUrl: '/focus' });

    await shows('Focus session finished');
    expect(screen.queryByRole('button', { name: 'Time left' })).toBeNull();
    expect(await outboxItems()).toHaveLength(1);
    expect(await storedTimer()).toBeNull();
  });

  it('stays on a safe screen while it cannot be handed off, and can be tried again', async () => {
    await storeTimer(ended());
    failWritesTo(sessionOutboxKey(USER));

    renderApp(appRoutes, { initialUrl: '/focus' });

    expect(
      await screen.findByText('Your session is still saved on this device.'),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Time left' })).toBeNull();
    expect(await storedTimer()).toEqual(ended());

    writeNormally();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    await shows('Focus session finished');
    expect(await outboxItems()).toHaveLength(1);
    expect(await storedTimer()).toBeNull();
  });
});

describe('no session', () => {
  it('says so and leads back Home', async () => {
    renderApp(appRoutes, { initialUrl: '/focus' });

    expect(await screen.findByText('No focus session is running.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));

    expect(await screen.findByRole('button', { name: 'Start Focus' })).toBeOnTheScreen();
  });
});

describe('Resume focus on Home', () => {
  it.each([
    ['running', () => timerState()],
    ['paused', () => timerState({ pausedAt: T0 + MINUTE })],
  ])('reopens a %s session instead of starting another', async (_mode, make) => {
    const existing = make();
    await storeTimer(existing);
    clock = T0 + 2 * MINUTE;
    renderApp(appRoutes, { initialUrl: '/' });

    const resume = await screen.findByRole('button', { name: 'Resume focus' });
    expect(screen.queryByRole('button', { name: 'Start Focus' })).toBeNull();
    fireEvent.press(resume);

    expect(await timeLeft()).toBeOnTheScreen();
    expect(screen.queryByText('Choose a topic')).toBeNull();
    expect(await storedTimer()).toEqual(existing);
  });
});

describe('accessibility', () => {
  it('reads the time left when asked, and never announces the ticking', async () => {
    // The preset's mock is shared by every test: start from no calls.
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    await storeTimer(timerState());
    const countdown = await openFocus();

    clock = T0 + 30 * SECOND;
    await shows('24:30');
    expect(announce).not.toHaveBeenCalled();
    // Nothing on the screen is a live region; the countdown's name never changes.
    const live = screen.UNSAFE_root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLiveRegion !== undefined &&
        node.props.accessibilityLiveRegion !== 'none',
    );
    expect(live).toEqual([]);
    expect(countdown.props.accessibilityLabel).toBe('Time left');

    fireEvent.press(countdown);
    expect(announce).toHaveBeenLastCalledWith('24 minutes 30 seconds left');

    clock = T0 + 60 * SECOND;
    fireEvent.press(screen.getByRole('button', { name: 'Time left' }));
    expect(announce).toHaveBeenLastCalledWith('24 minutes left');
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('names Pause, Resume, and End session', async () => {
    await storeTimer(timerState());
    await openFocus();

    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'End session' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeOnTheScreen();
  });

  it('keeps the countdown, the topic, and every control at 200% text', async () => {
    mockWindow.fontScale = 2;
    await saveTopics([{ ...reading, name: 'Reading a very long book about gardens' }]);
    await storeTimer(timerState({ plannedMinutes: 90 }));

    await openFocus();

    const digits = screen.getByText('01:30:00');
    expect(digits.props.allowFontScaling).not.toBe(false);
    expect(digits.props.numberOfLines).toBe(1);
    expect(digits.props.adjustsFontSizeToFit).toBe(true);
    expect(
      screen.getByRole('header', { name: 'Reading a very long book about gardens' }).props
        .numberOfLines,
    ).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'End session' })).toBeOnTheScreen();
    expect(screen.getByTestId('screen-scroll')).toBeOnTheScreen();
  });
});

describe('the topic shown', () => {
  it('is a topic still waiting to sync, by its own name', async () => {
    const pendingId = 'aaaaaaaa-0000-4000-8000-00000000000a';
    await AsyncStorage.setItem(
      topicCreateQueueKey(USER),
      JSON.stringify({
        version: 1,
        items: [
          {
            id: pendingId,
            payload: { name: 'Sketching', icon: 'pencil', color: 'topic.2', description: null },
            state: 'pending',
            attempted: false,
            queuedAt: 1,
          },
        ],
      }),
    );
    await storeTimer(timerState({ topicId: pendingId }));

    await openFocus();

    expect(await screen.findByRole('header', { name: 'Sketching' })).toBeOnTheScreen();
    expect(
      screen.getByTestId('topic-mark-pencil', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  it('falls back to a neutral name when nothing on the device knows the topic', async () => {
    await storeTimer(timerState());

    await openFocus();

    expect(screen.getByRole('header', { name: 'Focus topic' })).toBeOnTheScreen();
    expect(screen.getByText('25:00')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeOnTheScreen();
  });
});

describe('the progress ring', () => {
  const ring = () => screen.getByRole('progressbar', { name: 'Session progress' });

  it('moves with whole focused minutes while the countdown moves every second', async () => {
    await storeTimer(timerState());
    clock = T0 + 2 * MINUTE + 10 * SECOND;
    await openFocus();
    expect(ring()).toHaveAccessibilityValue({ now: 8 });

    clock = T0 + 2 * MINUTE + 11 * SECOND;
    await shows('22:49');
    clock = T0 + 2 * MINUTE + 12 * SECOND;
    await shows('22:48');
    expect(ring()).toHaveAccessibilityValue({ now: 8 });

    clock = T0 + 3 * MINUTE;
    await shows('22:00');
    expect(ring()).toHaveAccessibilityValue({ now: 12 });
  });

  it('holds still while paused', async () => {
    await storeTimer(timerState({ pausedAt: T0 + 5 * MINUTE }));
    clock = T0 + 6 * MINUTE;
    await openFocus();
    expect(ring()).toHaveAccessibilityValue({ now: 20 });

    clock = T0 + 9 * MINUTE;
    await sleep(1500);
    expect(ring()).toHaveAccessibilityValue({ now: 20 });
  });

  it('does not restart its animation on every tick', async () => {
    motion = true;
    // Counts the ring's animations without running their frames.
    const timing = jest
      .spyOn(Animated, 'timing')
      .mockImplementation(() => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }) as never);
    const ringAnimations = () =>
      timing.mock.calls.filter(([, config]) => config.duration === 600).length;
    await storeTimer(timerState());
    clock = T0 + 2 * MINUTE + 10 * SECOND;
    await openFocus();
    await until(() => ringAnimations() > 0);
    const opened = ringAnimations();

    for (const s of [11, 12, 13]) {
      clock = T0 + 2 * MINUTE + s * SECOND;
      await shows(`22:${60 - s}`);
    }
    expect(ringAnimations()).toBe(opened);

    clock = T0 + 3 * MINUTE;
    await shows('22:00');
    await until(() => ringAnimations() === opened + 1);
  });
});
