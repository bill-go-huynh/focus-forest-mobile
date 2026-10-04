import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';

import { NetworkError, type GrowthResult, type HomeResponse, type Topic } from '../api';
import { celebrationsKey } from '../celebrations/celebration-store';
import { homeSnapshotKey } from '../core-loop/home-snapshot-store';
import { sceneClock } from '../core-loop/scene-clock';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { mockAppState } from '../test-utils/app-state';
import {
  CLOSED_MONTH_GROWTH,
  makeCurrentTree,
  makeGrowth,
  makeHome,
  withWeeklyGoal,
} from '../test-utils/core-loop';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { makeSessionResult } from '../test-utils/sessions';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { makeTopic } from '../test-utils/topics';
import { activeTimerKey } from '../timer/active-timer-store';
import { deviceClock } from '../timer/app-timer-store';
import type { TimerState } from '../timer/timer-engine';
import { TreeScene } from '../tree/TreeScene';

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
const MINUTE = 60_000;
const SESSION_ID = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6';
const OTHER_SESSION = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c7';

const reading: Topic = makeTopic({
  id: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
  name: 'Reading',
  description: null,
  lastUsedAt: '2026-10-06T09:00:00.000Z',
  lastPlannedMinutes: 25,
});
const drawing: Topic = makeTopic({
  id: '7f3e5b70-4c6d-4e8f-a091-1c2d3e4f5061',
  name: 'Drawing',
  description: null,
  lastUsedAt: null,
  lastPlannedMinutes: null,
});

type Reply = { status: number; body?: unknown } | Error;

/**
 * The Phase 3 API: GET /me/home and /me/trees/current answer what the test sets, PUT
 * /me/sessions/:id stores a session with the growth set at that moment (a replay answers the
 * stored one, growth included). `offline` fails everything after preferences; `homeDown`
 * fails Home only.
 */
function coreLoopApi() {
  const sessions = new Map<string, unknown>();
  const state = {
    offline: false,
    homeDown: false,
    homeBody: null as unknown,
    home: makeHome({ recentTopics: [reading, drawing] }) as HomeResponse,
    currentTree: makeCurrentTree(
      { topTopicId: reading.id },
      { traits: ['streak-days:7', 'event-lantern:1'] },
    ),
    growth: makeGrowth() as GrowthResult | null,
    reducedMotion: true,
    loseNextSessionAnswer: false,
    /** PUT /me/sessions fails like a lost connection; Home still answers. */
    sessionsDown: false,
    /** GET /me/topics (every status) answers this list; `topicsDown` fails it. */
    topics: [reading, drawing] as Topic[],
    topicsDown: false,
    /** Home answers wait (with the Home as at the request) until the test releases them. */
    holdHome: false,
    /** Home after a session is stored, as the server would then answer it. */
    homeAfterSession: null as HomeResponse | null,
  };
  const heldHome: (() => void)[] = [];
  const handler = ({ url, method, body }: FakeRequest): Reply | Promise<Reply> => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences')
      return { status: 200, body: makePreferences({ reducedMotion: state.reducedMotion }) };
    if (state.offline) return new NetworkError();
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics') {
      if (state.topicsDown) return new NetworkError();
      const status = new URL(url).searchParams.get('status');
      const listed = state.topics.filter((topic) => !status || topic.status === status);
      return { status: 200, body: listed };
    }
    if (pathname === '/me/home') {
      if (state.homeDown) return new NetworkError();
      const reply = { status: 200, body: state.homeBody ?? state.home };
      if (!state.holdHome) return reply;
      return new Promise<Reply>((resolve) => heldHome.push(() => resolve(reply)));
    }
    if (pathname === '/me/trees/current') return { status: 200, body: state.currentTree };
    const [, , resource, id = ''] = pathname.split('/');
    if (resource === 'sessions' && method === 'PUT') {
      if (state.sessionsDown) return new NetworkError();
      const earlier = sessions.get(id);
      if (earlier) return { status: 200, body: earlier };
      const payload = body as { topicId: string; startedAt: string; endedAt: string };
      const stored = makeSessionResult({
        id,
        topicId: payload.topicId,
        startedAt: payload.startedAt,
        endedAt: payload.endedAt,
        status: 'completed',
        growth: state.growth,
      });
      sessions.set(id, stored);
      if (state.homeAfterSession) state.home = state.homeAfterSession;
      if (state.loseNextSessionAnswer) {
        state.loseNextSessionAnswer = false;
        return new NetworkError();
      }
      return { status: 201, body: stored };
    }
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
  /** Answers the oldest held Home request. */
  const releaseHome = () => heldHome.shift()?.();
  return { handler, state, sessions, releaseHome, heldHomeCount: () => heldHome.length };
}

let server: ReturnType<typeof coreLoopApi>;
let requests: FakeRequest[];
let appState: ReturnType<typeof mockAppState>;
let clock = 0;
let T0 = 0;
let sceneNow = Date.parse('2026-10-07T12:00:00');

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
  await AsyncStorage.clear();
  signInForTest();
  server = coreLoopApi();
  serve();
  T0 = Date.now();
  clock = T0;
  jest.spyOn(deviceClock, 'now').mockImplementation(() => clock);
  sceneNow = new Date(2026, 9, 7, 12, 0).getTime();
  jest.spyOn(sceneClock, 'now').mockImplementation(() => sceneNow);
  appState = mockAppState();
});
afterEach(async () => {
  await settleSheetTransitions();
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

/** Waits, in real time inside act, until an async condition (device storage) holds. */
async function untilAsync(condition: () => Promise<boolean>, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the condition.');
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
  }
}

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
const treeImage = () => screen.findByRole('image');
const scene = () => screen.UNSAFE_getByType(TreeScene);
const homeRequests = () => requests.filter((r) => r.url === `${API}/me/home`);
const announced = () =>
  jest.mocked(AccessibilityInfo.announceForAccessibility).mock.calls.map(([m]) => m);

function timerState(overrides: Partial<TimerState> = {}): TimerState {
  return {
    version: 1,
    id: SESSION_ID,
    topicId: reading.id,
    plannedMinutes: 25,
    rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
    startedAt: T0 - 30 * MINUTE,
    pauses: [],
    pausedAt: null,
    finished: { at: T0 - 5 * MINUTE, reason: 'completed' },
    ...overrides,
  };
}
async function finishedTimerOnDevice() {
  await AsyncStorage.setItem(activeTimerKey(USER), JSON.stringify(timerState()));
}
async function pendingCelebrations(userId = USER): Promise<string[]> {
  const raw = await AsyncStorage.getItem(celebrationsKey(userId));
  return raw === null
    ? []
    : (JSON.parse(raw) as { pending: { sessionId: string }[] }).pending.map((p) => p.sessionId);
}
async function storeCelebration(userId: string, sessionId: string, growth: GrowthResult) {
  await AsyncStorage.setItem(
    celebrationsKey(userId),
    JSON.stringify({
      version: 1,
      pending: [{ sessionId, startedAt: '2026-10-07T09:00:00.000Z', growth }],
      consumed: [],
    }),
  );
}

/** Home as the server answers it once today's goal is reached, with a given streak. */
function goalReached(home: HomeResponse, streak = home.streak.current): HomeResponse {
  return {
    ...home,
    streak: { ...home.streak, current: streak },
    goals: {
      ...home.goals,
      daily: {
        ...home.goals.daily,
        today: {
          ...home.goals.daily.today,
          focusedMinutes: 67,
          remainingMinutes: 0,
          completed: true,
        },
      },
    },
  };
}

const completionProgress = () => screen.queryByTestId('completion-progress');
const pause = (ms = 300) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

async function openHome() {
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockClear();
  renderApp(appRoutes, { initialUrl: '/' });
  await screen.findByRole('button', { name: /Start Focus|Resume focus/ });
}

describe('Home', () => {
  it('leads with the tree, then today’s goal, streak, and this week, from /me/home', async () => {
    await openHome();
    const image = await treeImage();
    expect(image.props.accessibilityLabel).toMatch(/^October 2026 tree\. Mature Tree\./);
    expect(await screen.findByRole('progressbar', { name: 'Daily goal' })).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ text: '42 / 60 min' }),
    );
    expect(screen.getByText('4-day streak')).toBeOnTheScreen();
    expect(screen.getByText('This week: 3 h 20 min focused')).toBeOnTheScreen();
    // No weekly goal this week: no weekly progress, but the week's focus is still there.
    expect(screen.queryByRole('progressbar', { name: 'Weekly goal' })).toBeNull();
    expect(homeRequests()).toHaveLength(1);
  });

  it('shows weekly goal progress when this week has a goal', async () => {
    server.state.home = withWeeklyGoal(server.state.home, 200, 300);
    await openHome();
    expect(await screen.findByRole('progressbar', { name: 'Weekly goal' })).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ text: '200 / 300 min' }),
    );
    expect(screen.getByText('This week: 3 h 20 min focused')).toBeOnTheScreen();
  });

  it('shows a rest day instead of the streak line', async () => {
    server.state.home = { ...server.state.home, rest: { ...server.state.home.rest, today: true } };
    await openHome();
    expect(await screen.findByText('Rest day today · your 4-day streak is kept')).toBeOnTheScreen();
  });

  it('quick-starts a recent topic with its remembered duration in one tap', async () => {
    await openHome();
    fireEvent.press(await screen.findByRole('button', { name: 'Start Reading, 25 minutes' }));
    await untilAsync(async () => (await AsyncStorage.getItem(activeTimerKey(USER))) !== null);
    const raw = await AsyncStorage.getItem(activeTimerKey(USER));
    expect(JSON.parse(raw!)).toMatchObject({ topicId: reading.id, plannedMinutes: 25 });
    // Straight to Focus: no sheet, no duration step.
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    expect(screen.queryByText('Choose a topic')).toBeNull();
  });

  it('asks for a duration for a recent topic without a remembered one', async () => {
    await openHome();
    fireEvent.press(await screen.findByRole('button', { name: 'Choose a duration for Drawing' }));
    expect(await screen.findByRole('button', { name: 'Start focus' })).toBeOnTheScreen();
  });

  it('reads Resume focus with a running timer, and offers no quick start over it', async () => {
    await AsyncStorage.setItem(
      activeTimerKey(USER),
      JSON.stringify(timerState({ startedAt: T0 - MINUTE, finished: null })),
    );
    await openHome();
    expect(await screen.findByRole('button', { name: 'Resume focus' })).toBeOnTheScreen();
    await treeImage();
    expect(screen.queryByRole('button', { name: /^Start Reading/ })).toBeNull();
  });

  it('shows the last saved Home offline, and says so', async () => {
    await openHome();
    await treeImage();
    await untilAsync(async () => (await AsyncStorage.getItem(homeSnapshotKey(USER))) !== null);
    screen.unmount();

    server.state.offline = true;
    await openHome();
    expect((await treeImage()).props.accessibilityLabel).toMatch(/Mature Tree/);
    expect(
      await screen.findByText('Showing your tree as last saved on this device.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('4-day streak')).toBeOnTheScreen();
  });

  it('keeps Start Focus and a calm retry when Home cannot load and nothing is saved', async () => {
    server.state.homeDown = true;
    await openHome();
    expect(await screen.findByText("We couldn't load your tree right now.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start Focus' })).toBeOnTheScreen();
    expect(screen.queryByRole('image')).toBeNull();
  });

  it('treats an invalid Home answer like an unavailable one', async () => {
    server.state.homeBody = { ...makeHome(), tree: { nonsense: true } };
    await openHome();
    expect(await screen.findByText("We couldn't load your tree right now.")).toBeOnTheScreen();
  });

  it('never shows another user’s saved Home', async () => {
    await AsyncStorage.setItem(
      homeSnapshotKey(OTHER_USER),
      JSON.stringify({ version: 1, savedAt: 1, home: makeHome() }),
    );
    server.state.offline = true;
    await openHome();
    expect(await screen.findByText("We couldn't load your tree right now.")).toBeOnTheScreen();
    expect(screen.queryByRole('image')).toBeNull();
  });

  it('asks the server again after a session syncs, and shows its new progress', async () => {
    const home = server.state.home;
    server.state.homeAfterSession = {
      ...home,
      tree: {
        ...home.tree,
        progress: { ...home.tree.progress, stage: 'blooming_tree', stageNumber: 6 },
      },
      goals: {
        ...home.goals,
        daily: {
          ...home.goals.daily,
          today: {
            ...home.goals.daily.today,
            focusedMinutes: 67,
            remainingMinutes: 0,
            completed: true,
          },
        },
      },
    };
    server.state.growth = makeGrowth({ stage: { from: 'mature_tree', to: 'blooming_tree' } });
    await finishedTimerOnDevice();
    await openHome();
    expect(await screen.findByRole('progressbar', { name: 'Daily goal' })).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ text: expect.any(String) }),
    );
    await until(() =>
      screen
        .queryAllByRole('progressbar', { name: 'Daily goal' })
        .some((ring) => ring.props.accessibilityValue?.text === 'Goal reached · 67 / 60 min'),
    );
    expect(homeRequests().length).toBeGreaterThanOrEqual(2);
    // The stage on screen is the server's, never computed from the session's minutes.
    await until(() => scene().props.tree.stage === 'blooming_tree');
    expect(scene().props.tree.stage).toBe('blooming_tree');
  });

  it('keeps the pending month ceremony for later and marks nothing seen', async () => {
    server.state.home = { ...server.state.home, pendingCeremony: { year: 2026, month: 9 } };
    await openHome();
    await treeImage();
    expect(requests.some((r) => r.url.includes('ceremony-seen'))).toBe(false);
  });

  it('relights the scene when the app returns, without changing the tree', async () => {
    await openHome();
    await treeImage();
    expect(scene().props.timeOfDay).toBe('day');
    const tree = scene().props.tree;

    sceneNow = new Date(2026, 9, 7, 22, 0).getTime();
    await appState.emit('background');
    await appState.emit('active');
    await until(() => scene().props.timeOfDay === 'night');
    expect(scene().props.tree).toEqual(tree);
  });
});

describe('today’s goal reached: said quietly, once (M3.3)', () => {
  const REACHED = "You reached today's goal.";

  it('says it once on Home from the server’s answer, never again', async () => {
    server.state.home = goalReached(server.state.home);
    await openHome();
    await shows(REACHED);
    await until(() => announced().includes(REACHED));
    await untilAsync(async () => {
      const raw = await AsyncStorage.getItem(celebrationsKey(USER));
      return raw !== null && JSON.parse(raw).goalsCelebrated?.includes('2026-10-07');
    });
    screen.unmount();

    await openHome();
    await treeImage();
    await pause();
    expect(screen.queryByText(REACHED)).toBeNull();
    expect(announced().filter((m) => m === REACHED)).toHaveLength(0);
  });

  it('says it on Completion when the session reached it, and Home does not repeat it', async () => {
    server.state.homeAfterSession = goalReached(server.state.home);
    server.state.growth = makeGrowth({ blossoms: { from: 1, to: 2 } });
    await finishedTimerOnDevice();
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    await until(() => completionProgress() !== null);
    expect(within(completionProgress()!).getByText(REACHED)).toBeOnTheScreen();
    // The blossoms are the tree's reward: one moment, no second animation.
    await shows('New blossoms opened.');
    await untilAsync(async () => {
      const raw = await AsyncStorage.getItem(celebrationsKey(USER));
      return raw !== null && JSON.parse(raw).goalsCelebrated?.includes('2026-10-07');
    });
    screen.unmount();

    await openHome();
    await treeImage();
    await pause();
    expect(screen.queryByText(REACHED)).toBeNull();
  });

  it('never says it from a Home saved on the device', async () => {
    await AsyncStorage.setItem(
      homeSnapshotKey(USER),
      JSON.stringify({ version: 1, savedAt: 1, home: goalReached(makeHome()) }),
    );
    server.state.offline = true;
    await openHome();
    await treeImage();
    await pause();
    expect(screen.queryByText(REACHED)).toBeNull();
  });

  it('says nothing while the goal is not reached', async () => {
    await openHome();
    await treeImage();
    await pause();
    expect(screen.queryByText(REACHED)).toBeNull();
  });
});

describe('Tree Details (current month)', () => {
  async function openTreeDetails() {
    await openHome();
    await treeImage();
    fireEvent.press(screen.getByRole('button', { name: 'Tree details' }));
    await screen.findByRole('header', { name: 'October 2026' });
    await screen.findByText('12 h 30 min focused');
  }

  it('shows the tree, month, stage, month stats, streak, top topic, and traits from the server', async () => {
    await openHome();
    await treeImage();
    fireEvent.press(screen.getByRole('button', { name: 'Tree details' }));
    expect(await screen.findByRole('header', { name: 'October 2026' })).toBeOnTheScreen();
    expect(await screen.findByText('12 h 30 min focused')).toBeOnTheScreen();
    expect(screen.getByText('Mature Tree · growing toward Blooming Tree')).toBeOnTheScreen();
    expect(screen.getByText('21 sessions')).toBeOnTheScreen();
    expect(screen.getByText('12 active days')).toBeOnTheScreen();
    expect(screen.getByText('Daily goals met: 8')).toBeOnTheScreen();
    expect(screen.getByText('Weekly goals met: 1')).toBeOnTheScreen();
    expect(screen.getByText('Current streak: 4 days')).toBeOnTheScreen();
    expect(screen.getByText('Top topic: Reading')).toBeOnTheScreen();
    expect(screen.getByText("A songbird's nest for your 7-day streak")).toBeOnTheScreen();
    expect(screen.getByText('1 more milestone detail')).toBeOnTheScreen();
    expect(screen.getAllByRole('image')).toHaveLength(1);
    expect(screen.getByRole('header', { name: 'Milestones' })).toBeOnTheScreen();
  });

  it('offers Start Focus below the details, the Phase 2 entry in one tap', async () => {
    await openTreeDetails();
    const start = await screen.findByRole('button', { name: 'Start Focus' });
    fireEvent.press(start);
    // The same topic picker as Home's Start Focus: no second focus flow, no extra step.
    expect(await screen.findByText('Choose a topic')).toBeOnTheScreen();
  });

  it('reads Resume focus when a timer is running, and goes back to it', async () => {
    await AsyncStorage.setItem(
      activeTimerKey(USER),
      JSON.stringify(timerState({ startedAt: T0 - MINUTE, finished: null })),
    );
    await openTreeDetails();
    fireEvent.press(await screen.findByRole('button', { name: 'Resume focus' }));
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    expect(screen.queryByText('Choose a topic')).toBeNull();
  });

  it('names a top topic that is not recent from the topic list', async () => {
    const thesis = makeTopic({ id: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d', name: 'Thesis' });
    server.state.home = { ...server.state.home, recentTopics: [drawing] };
    server.state.currentTree = makeCurrentTree({ topTopicId: thesis.id });
    server.state.topics = [reading, drawing, thesis];
    await openTreeDetails();
    expect(await screen.findByText('Top topic: Thesis')).toBeOnTheScreen();
    expect(screen.queryByText(new RegExp(thesis.id))).toBeNull();
  });

  it('names an archived top topic', async () => {
    const archived = makeTopic({
      id: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5e',
      name: 'Old course',
      status: 'archived',
      archivedAt: '2026-10-05T09:00:00.000Z',
    });
    server.state.home = { ...server.state.home, recentTopics: [reading] };
    server.state.currentTree = makeCurrentTree({ topTopicId: archived.id });
    server.state.topics = [reading, drawing, archived];
    await openTreeDetails();
    expect(await screen.findByText('Top topic: Old course')).toBeOnTheScreen();
    // Asked once, for every topic (archived included), never per topic.
    expect(requests.filter((r) => r.url === `${API}/me/topics`)).toHaveLength(1);
  });

  it('never shows a raw topic id or another topic when the name cannot be known', async () => {
    const unknownId = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5f';
    server.state.home = { ...server.state.home, recentTopics: [reading] };
    server.state.currentTree = makeCurrentTree({ topTopicId: unknownId });
    server.state.topicsDown = true;
    await openTreeDetails();
    expect(await screen.findByText('Top topic: name not available right now')).toBeOnTheScreen();
    expect(screen.queryByText(new RegExp(unknownId))).toBeNull();
    expect(screen.queryByText('Top topic: Reading')).toBeNull();
  });

  it('falls back to the saved tree offline, without inventing numbers', async () => {
    await openHome();
    await treeImage();
    await untilAsync(async () => (await AsyncStorage.getItem(homeSnapshotKey(USER))) !== null);
    screen.unmount();
    server.state.offline = true;
    renderApp(appRoutes, { initialUrl: '/tree' });
    expect((await treeImage()).props.accessibilityLabel).toMatch(/Mature Tree/);
    expect(
      await screen.findByText("This month's numbers load when you're online."),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/focused$/)).toBeNull();
  });
});

describe('Session Completion with the server’s growth', () => {
  async function openCompletion() {
    await finishedTimerOnDevice();
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockClear();
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
  }

  it('plays a stage change as the one moment, says the rest, and consumes it once', async () => {
    server.state.growth = makeGrowth(
      { stage: { from: 'growing_tree', to: 'mature_tree' }, blossoms: { from: 1, to: 2 } },
      { stage: 'mature_tree' },
    );
    await openCompletion();
    await shows('Your tree became a Mature Tree.');
    expect(screen.getByText('Also: New blossoms opened.')).toBeOnTheScreen();
    expect((await treeImage()).props.accessibilityLabel).toMatch(/Mature Tree/);
    await until(() => announced().includes('Your tree became a Mature Tree.'));
    await untilAsync(async () => (await pendingCelebrations()).length === 0);
    expect(announced().filter((m) => m === 'Your tree became a Mature Tree.')).toHaveLength(1);
  });

  it('shows a trait, blossoms, or plain growth as the moment', async () => {
    for (const [growth, caption] of [
      [
        makeGrowth({ newTraits: [{ id: 'streak-days:7', earnedAt: '2026-10-07T18:00:00.000Z' }] }),
        "A songbird's nest for your 7-day streak.",
      ],
      [makeGrowth({ blossoms: { from: 1, to: 2 } }), 'New blossoms opened.'],
      [makeGrowth(), 'Your tree grew.'],
    ] as const) {
      await AsyncStorage.clear();
      server = coreLoopApi();
      server.state.growth = growth;
      serve();
      await openCompletion();
      await shows(caption);
      screen.unmount();
    }
  });

  it('shows the same moment under full motion', async () => {
    server.state.reducedMotion = false;
    server.state.growth = makeGrowth({ blossoms: { from: 1, to: 2 } });
    await openCompletion();
    await shows('New blossoms opened.');
  });

  it('shows no tree moment for growth null', async () => {
    server.state.growth = null;
    await openCompletion();
    await shows('Session complete');
    expect(screen.queryByText(/Your tree/)).toBeNull();
    expect(screen.queryByRole('image')).toBeNull();
  });

  it('says calmly that a closed month’s tree is already in the forest', async () => {
    server.state.growth = CLOSED_MONTH_GROWTH;
    await openCompletion();
    await shows(/already resting in your forest/);
    expect(screen.queryByRole('image')).toBeNull();
    expect(await pendingCelebrations()).toEqual([]);
  });

  it('shows the server’s daily goal and streak once Home is fetched after the sync', async () => {
    server.state.home = {
      ...server.state.home,
      goals: {
        ...server.state.home.goals,
        daily: {
          ...server.state.home.goals.daily,
          today: {
            ...server.state.home.goals.daily.today,
            focusedMinutes: 67,
            remainingMinutes: 0,
            completed: true,
          },
        },
      },
    };
    await openCompletion();
    expect(await screen.findByRole('progressbar', { name: 'Daily goal' })).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ text: 'Goal reached · 67 / 60 min' }),
    );
    expect(screen.getByText('4-day streak')).toBeOnTheScreen();
  });
});

describe('Completion progress is only ever a Home asked after the session was confirmed', () => {
  async function homeBeforeConfirmationInFlight() {
    server.state.homeAfterSession = goalReached(server.state.home, 5);
    server.state.sessionsDown = true;
    await finishedTimerOnDevice();
    await openHome();
    // Home A (42 / 60, 4-day streak) is cached before the server has the session.
    await screen.findByRole('progressbar', { name: 'Daily goal' });
    expect(server.sessions.has(SESSION_ID)).toBe(false);
    // Another Home request, asked before the confirmation too, is still on its way.
    server.state.holdHome = true;
    act(() => router.push('/tree'));
    await until(() => server.heldHomeCount() === 1);
    act(() => router.push(`/completion/${SESSION_ID}`));
    await shows('Saved on this device. Your tree and progress update once it syncs.');
    // The session syncs: the server confirms it and Home now has today's new progress.
    server.state.sessionsDown = false;
    await appState.emit('background');
    await appState.emit('active');
    await shows('Session complete');
    expect(server.sessions.has(SESSION_ID)).toBe(true);
  }

  it('rejects the cached and the in-flight Home from before the confirmation', async () => {
    await homeBeforeConfirmationInFlight();
    // The request asked before the confirmation answers now, with Home A.
    server.releaseHome();
    await pause();
    expect(completionProgress()).toBeNull();
    expect(screen.queryByText('Goal reached · 67 / 60 min')).toBeNull();
  });

  it('accepts the Home asked after the confirmation', async () => {
    await homeBeforeConfirmationInFlight();
    server.releaseHome();
    await until(() => server.heldHomeCount() > 0);
    while (server.heldHomeCount() > 0) server.releaseHome();
    await until(() => completionProgress() !== null);
    const progress = within(completionProgress()!);
    expect(progress.getByRole('progressbar', { name: 'Daily goal' })).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ text: 'Goal reached · 67 / 60 min' }),
    );
    expect(progress.getByText('5-day streak')).toBeOnTheScreen();
  });
});

describe('offline completion, then the sync', () => {
  async function openOfflineCompletion() {
    server.state.offline = true;
    server.state.growth = makeGrowth({ blossoms: { from: 1, to: 2 } });
    await finishedTimerOnDevice();
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockClear();
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    await shows('Focus session finished');
  }

  it('invents no growth, goal, or streak while offline, and lets the user leave', async () => {
    await openOfflineCompletion();
    expect(
      screen.getByText('Saved on this device. Your tree and progress update once it syncs.'),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('image')).toBeNull();
    expect(screen.queryByText(/Your tree grew|blossoms|Goal reached|streak$/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Done' })).toBeOnTheScreen();
  });

  it('upgrades the open Completion in place when the sync answers, once', async () => {
    await openOfflineCompletion();
    server.state.offline = false;
    await appState.emit('background');
    await appState.emit('active');
    await shows('New blossoms opened.');
    expect(screen.getByText('Session complete')).toBeOnTheScreen();
    await untilAsync(async () => (await pendingCelebrations()).length === 0);
    expect(announced().filter((m) => m === 'New blossoms opened.')).toHaveLength(1);
  });

  it('shows a growth that arrives after the user left on Home, once', async () => {
    await openOfflineCompletion();
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('button', { name: /Start Focus/ });

    server.state.offline = false;
    await appState.emit('background');
    await appState.emit('active');
    await shows('New blossoms opened.');
    await untilAsync(async () => (await pendingCelebrations()).length === 0);
    screen.unmount();

    // A later Home visit never replays it.
    await openHome();
    await treeImage();
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
    expect(screen.queryByText('New blossoms opened.')).toBeNull();
  });

  it('keeps a celebration across a kill and shows it on the next Home, once', async () => {
    await storeCelebration(
      USER,
      SESSION_ID,
      makeGrowth({ stage: { from: 'young_tree', to: 'growing_tree' } }),
    );
    await openHome();
    await shows('Your tree became a Growing Tree.');
    await untilAsync(async () => (await pendingCelebrations()).length === 0);
    screen.unmount();

    await openHome();
    await treeImage();
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
    expect(screen.queryByText('Your tree became a Growing Tree.')).toBeNull();
  });

  it('keeps a waiting celebration until the tree is on screen to show it', async () => {
    await storeCelebration(USER, SESSION_ID, makeGrowth({ blossoms: { from: 1, to: 2 } }));
    server.state.homeDown = true;
    await openHome();
    await shows("We couldn't load your tree right now.");
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
    expect(await pendingCelebrations()).toEqual([SESSION_ID]);

    server.state.homeDown = false;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await shows('New blossoms opened.');
    await untilAsync(async () => (await pendingCelebrations()).length === 0);
  });

  it('shows several waiting sessions as one moment, and the rest in words', async () => {
    await AsyncStorage.setItem(
      celebrationsKey(USER),
      JSON.stringify({
        version: 1,
        pending: [
          {
            sessionId: SESSION_ID,
            startedAt: '2026-10-07T08:00:00.000Z',
            growth: makeGrowth({ blossoms: { from: 1, to: 2 } }),
          },
          {
            sessionId: OTHER_SESSION,
            startedAt: '2026-10-07T09:00:00.000Z',
            growth: makeGrowth({ stage: { from: 'growing_tree', to: 'mature_tree' } }),
          },
        ],
        consumed: [],
      }),
    );
    await openHome();
    await shows('Your tree became a Mature Tree.');
    expect(screen.getByText('Also: New blossoms opened.')).toBeOnTheScreen();
    await untilAsync(async () => (await pendingCelebrations()).length === 0);
  });

  it('never shows another user’s waiting celebration', async () => {
    await storeCelebration(OTHER_USER, SESSION_ID, makeGrowth({ blossoms: { from: 1, to: 2 } }));
    await openHome();
    await treeImage();
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
    expect(screen.queryByText('New blossoms opened.')).toBeNull();
    expect(await pendingCelebrations(OTHER_USER)).toEqual([SESSION_ID]);
  });

  it('turns a lost answer and its replay into one celebration', async () => {
    server.state.loseNextSessionAnswer = true;
    server.state.growth = makeGrowth({ blossoms: { from: 1, to: 2 } });
    await finishedTimerOnDevice();
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockClear();
    renderApp(appRoutes, { initialUrl: `/completion/${SESSION_ID}` });
    await until(() => server.sessions.has(SESSION_ID));
    await appState.emit('background');
    await appState.emit('active');
    await shows('New blossoms opened.');
    await untilAsync(async () => (await pendingCelebrations()).length === 0);
    expect(announced().filter((m) => m === 'New blossoms opened.')).toHaveLength(1);
  });
});
