import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

import { NetworkError, type ForestItem, type HomeResponse, type Recap } from '../api';
import { celebrationsKey } from '../celebrations/celebration-store';
import { homeSnapshotKey } from '../core-loop/home-snapshot-store';
import { sceneClock } from '../core-loop/scene-clock';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { mockAppState } from '../test-utils/app-state';
import { makeCurrentTree, makeHome } from '../test-utils/core-loop';
import {
  archivedDetails,
  archivedStats,
  forestMonths,
  forestPage,
  makeRecap,
  NOTE_TEXT,
  SEPTEMBER,
} from '../test-utils/forest';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { activeTimerKey } from '../timer/active-timer-store';
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
const PAGE = 24;

type Reply = { status: number; body?: unknown } | Error;

/**
 * The A3.4 API: the forest pages `months` (newest first) by an opaque cursor, a month's details
 * and recap answer what the test set, and the seen marks are recorded. Home carries
 * `pendingCeremony` as the server decides it; nothing here reads the device date.
 */
function forestApi() {
  const state = {
    offline: false,
    reducedMotion: true,
    months: forestMonths(40) as ForestItem[],
    /** Requests for the page after the first that fail (a request and its retries). */
    failNextPage: 0,
    /** The second page repeats the first page's last month (a month that moved). */
    overlapPages: false,
    pendingCeremony: null as { year: number; month: number } | null,
    homeBody: null as HomeResponse | null,
    recap: makeRecap() as Recap,
    details: archivedDetails() as unknown,
    ceremonySeenReply: null as Reply | null,
  };
  const seen = { ceremony: [] as string[], recap: [] as string[] };
  const handler = ({ url, method }: FakeRequest): Reply => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/me/preferences')
      return { status: 200, body: makePreferences({ reducedMotion: state.reducedMotion }) };
    if (state.offline) return new NetworkError();
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics') return { status: 200, body: [] };
    if (pathname === '/me/home')
      return {
        status: 200,
        body: state.homeBody ?? makeHome({ pendingCeremony: state.pendingCeremony }),
      };
    if (pathname === '/me/trees/current') return { status: 200, body: makeCurrentTree() };
    if (pathname === '/me/forest') {
      const cursor = searchParams.get('cursor');
      const start = cursor === null ? 0 : Number(cursor.replace('opaque:', ''));
      if (start > 0 && state.failNextPage > 0) {
        state.failNextPage -= 1;
        return new NetworkError();
      }
      const from = state.overlapPages && start > 0 ? start - 1 : start;
      const items = state.months.slice(from, start + PAGE);
      const next = start + PAGE < state.months.length ? `opaque:${start + PAGE}` : null;
      return { status: 200, body: forestPage(items, next) };
    }
    if (pathname === '/me/sessions') {
      return { status: 200, body: { items: [], nextCursor: null } };
    }
    const match = pathname.match(/^\/me\/trees\/(\d+)\/(\d+)(\/.*)?$/);
    if (match) {
      const [, year, month, rest] = match;
      const key = `${year}-${month}`;
      if (rest === '/ceremony-seen' && method === 'PUT') {
        seen.ceremony.push(key);
        const reply = state.ceremonySeenReply;
        if (reply) {
          state.ceremonySeenReply = null;
          return reply;
        }
        state.pendingCeremony = null;
        return {
          status: 200,
          body: { ceremonySeenAt: '2026-11-01T08:00:00.000Z', recapSeenAt: null },
        };
      }
      if (rest === '/recap-seen' && method === 'PUT') {
        seen.recap.push(key);
        return {
          status: 200,
          body: { ceremonySeenAt: null, recapSeenAt: '2026-11-01T08:00:00.000Z' },
        };
      }
      if (rest === '/recap') return { status: 200, body: state.recap };
      const resting = state.months.find(
        (m) => m.kind === 'resting' && `${m.year}-${m.month}` === key,
      );
      if (resting)
        return { status: 200, body: { kind: 'resting', year: resting.year, month: resting.month } };
      return { status: 200, body: state.details };
    }
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
  return { handler, state, seen };
}

let server: ReturnType<typeof forestApi>;
let requests: FakeRequest[];
let appState: ReturnType<typeof mockAppState>;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = API;
  await AsyncStorage.clear();
  signInForTest();
  server = forestApi();
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
  appState = mockAppState();
  jest.spyOn(sceneClock, 'now').mockImplementation(() => new Date(2026, 10, 1, 12, 0).getTime());
});
afterEach(async () => {
  await settleSheetTransitions();
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
const pause = (ms = 300) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const forestRequests = () => requests.filter((r) => new URL(r.url).pathname === '/me/forest');
const listRows = () => within(screen.getByTestId('forest-list')).getAllByRole('button');

async function openForest() {
  renderApp(appRoutes, { initialUrl: '/forest' });
  await screen.findByRole('header', { name: 'Forest' });
  await screen.findByTestId('forest-landscape');
}
async function openListView() {
  await openForest();
  fireEvent.press(screen.getByRole('button', { name: 'List view' }));
  await screen.findByTestId('forest-list');
}

describe('Forest tab', () => {
  it('shows the landscape with the current month at the growing edge, and a quiet summary', async () => {
    await openForest();
    expect(screen.getByText('75 h 30 min of focus · 3 trees planted')).toBeOnTheScreen();
    const landscape = screen.getByTestId('forest-landscape');
    // Newest first as the server sends it, drawn from the growing edge.
    expect(landscape.props.inverted).toBe(true);
    expect(
      within(landscape).getByRole('button', {
        name: 'October 2026, growing now, Young Tree, 12 hours 30 minutes focused so far',
      }),
    ).toBeOnTheScreen();
    expect(
      within(landscape).getByRole('button', {
        name: 'June 2026, a quiet month, no focus recorded',
      }),
    ).toBeOnTheScreen();
    expect(forestRequests()).toHaveLength(1);
  });

  it('draws overview trees still and bounded: no idle motion, never all months at once', async () => {
    await openForest();
    const scenes = screen.UNSAFE_getAllByType(TreeScene);
    expect(scenes.length).toBeGreaterThan(0);
    expect(scenes.length).toBeLessThanOrEqual(12);
    for (const scene of scenes) {
      expect(scene.props).toMatchObject({ size: 'thumbnail', motion: 'still', active: false });
    }
  });

  it('reads each month’s focus in the list: frozen for archived months, none for quiet ones', async () => {
    await openListView();
    expect(
      screen.getByRole('button', {
        name: 'September 2026, Young Tree, 2 hours 35 minutes focused',
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'June 2026, a quiet month, no focus recorded' }),
    ).toBeOnTheScreen();
    // Focus, never the tree's growth minutes (600 in every fixture tree: "10 hours focused").
    const labels = listRows().map((row) => row.props.accessibilityLabel as string);
    expect(labels.filter((label) => label.endsWith(', 10 hours focused'))).toEqual([]);
  });

  it('keeps every month in both views, quiet ones included, in the same order', async () => {
    await openListView();
    const labels = listRows().map((row) => row.props.accessibilityLabel as string);
    expect(labels).toHaveLength(PAGE);
    expect(labels[0]).toMatch(/^October 2026/);
    expect(labels.filter((label) => /a quiet month/.test(label))).toHaveLength(5);
    fireEvent.press(screen.getByRole('button', { name: 'Landscape view' }));
    const landscape = await screen.findByTestId('forest-landscape');
    expect(landscape.props.data.map((m: ForestItem) => `${m.year}-${m.month}`)).toEqual(
      server.state.months.slice(0, PAGE).map((m) => `${m.year}-${m.month}`),
    );
  });

  it('marks years as groupings in the list, across pages', async () => {
    await openListView();
    expect(screen.getByRole('header', { name: '2026' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: '2025' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Show earlier months' }));
    await screen.findByRole('header', { name: '2023' });
    // 2024 spans both pages and is one grouping.
    expect(screen.getAllByRole('header', { name: '2024' })).toHaveLength(1);
  });

  it('pages 40 months by the cursor, each month once, newest first', async () => {
    server.state.overlapPages = true;
    await openListView();
    fireEvent.press(screen.getByRole('button', { name: 'Show earlier months' }));
    await until(() => listRows().length === 40);
    const labels = listRows().map((row) => row.props.accessibilityLabel as string);
    expect(new Set(labels).size).toBe(40);
    expect(labels.at(-1)).toMatch(/^July 2023/);
    expect(forestRequests().map((r) => new URL(r.url).searchParams.get('cursor'))).toEqual([
      null,
      'opaque:24',
    ]);
    expect(screen.queryByRole('button', { name: 'Show earlier months' })).toBeNull();
  });

  it('loads earlier months from the landscape’s far end', async () => {
    await openForest();
    const landscape = screen.getByTestId('forest-landscape');
    await act(async () => landscape.props.onEndReached());
    await until(() => screen.getByTestId('forest-landscape').props.data.length === 40);
  });

  it('keeps loaded months when an earlier page fails, and retries it', async () => {
    server.state.failNextPage = 3;
    await openListView();
    fireEvent.press(screen.getByRole('button', { name: 'Show earlier months' }));
    await shows("Earlier months couldn't load right now.");
    expect(listRows()).toHaveLength(PAGE);
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await until(() => listRows().length === 40);
  });

  it('opens the growing tree, an archived tree, and a quiet month', async () => {
    await openListView();
    fireEvent.press(
      screen.getByRole('button', {
        name: 'October 2026, growing now, Young Tree, 12 hours 30 minutes focused so far',
      }),
    );
    expect(await screen.findByText('12 h 30 min focused')).toBeOnTheScreen();
    act(() => router.back());

    fireEvent.press(await screen.findByRole('button', { name: /^September 2026, / }));
    expect(await screen.findByRole('button', { name: 'View recap' })).toBeOnTheScreen();
    act(() => router.back());

    fireEvent.press(
      await screen.findByRole('button', { name: 'June 2026, a quiet month, no focus recorded' }),
    );
    expect(await screen.findByText('This was a quiet month in your forest.')).toBeOnTheScreen();
    expect(screen.queryByRole('image')).toBeNull();
  });

  it('keeps the loaded forest on screen when a refresh fails', async () => {
    await openForest();
    server.state.offline = true;
    await appState.emit('background');
    await appState.emit('active');
    await pause();
    expect(
      screen.getByRole('button', {
        name: 'October 2026, growing now, Young Tree, 12 hours 30 minutes focused so far',
      }),
    ).toBeOnTheScreen();
  });
});

describe('archived Tree Details', () => {
  async function openSeptember() {
    renderApp(appRoutes, { initialUrl: '/month/2026/9' });
    await screen.findByRole('button', { name: 'View recap' });
  }

  it('shows the frozen tree at rest and the month’s snapshot', async () => {
    await openSeptember();
    expect(screen.getByRole('header', { name: 'September 2026' })).toBeOnTheScreen();
    expect(screen.UNSAFE_getByType(TreeScene).props.tree).toMatchObject({
      stage: 'mature_tree',
      ambience: 'at_rest',
    });
    for (const text of [
      '25 h 10 min focused',
      '38 sessions',
      '19 active days',
      'Top topic: Reading',
      'Longest streak: 9 days',
      'Daily goals met: 12',
      'Weekly goals met: 3',
    ]) {
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
  });

  it('shows highlighted notes as they read at archive, never the live session note', async () => {
    await openSeptember();
    expect(screen.getByRole('header', { name: 'Highlighted notes' })).toBeOnTheScreen();
    expect(screen.getByText(NOTE_TEXT)).toBeOnTheScreen();
    expect(requests.some((r) => r.url.includes('/me/sessions'))).toBe(false);
  });

  it('shows no badge or event section while there are none', async () => {
    await openSeptember();
    expect(screen.queryByText(/badge/i)).toBeNull();
    expect(screen.queryByText(/event/i)).toBeNull();
  });

  it('leaves out a top topic and notes the month did not have', async () => {
    server.state.details = archivedDetails({
      stats: archivedStats({ topTopic: null }),
      highlightedNotes: [],
    });
    await openSeptember();
    expect(screen.queryByText(/Top topic/)).toBeNull();
    expect(screen.queryByRole('header', { name: 'Highlighted notes' })).toBeNull();
  });

  it('opens the recap again without the planting ceremony, and marks only the recap seen', async () => {
    await openSeptember();
    await pause();
    // Opening details is not viewing the recap.
    expect(server.seen.recap).toEqual([]);
    fireEvent.press(screen.getByRole('button', { name: 'View recap' }));
    expect(await screen.findByText('Page 1 of 10')).toBeOnTheScreen();
    await until(() => server.seen.recap.length === 1);
    expect(server.seen.ceremony).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Plant in your forest' })).toBeNull();
  });
});

describe('month-end ceremony', () => {
  async function openHomeWithCeremony() {
    server.state.pendingCeremony = SEPTEMBER;
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: 'Plant in your forest' });
  }

  it('opens from the server’s pending month on Home, with the final tree', async () => {
    await openHomeWithCeremony();
    expect(screen.getByRole('header', { name: 'September 2026' })).toBeOnTheScreen();
    // The ceremony's own scene, above Home's.
    expect(screen.UNSAFE_getAllByType(TreeScene).at(-1)!.props.tree.ambience).toBe('at_rest');
    expect(screen.getByRole('button', { name: 'Skip' })).toBeOnTheScreen();
    // Shown, not yet accepted: nothing is marked.
    expect(server.seen.ceremony).toEqual([]);
  });

  it('never starts from the device date: no pending month, no ceremony', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 10, 1, 9, 0).getTime());
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: /Start Focus/ });
    await pause();
    expect(screen.queryByRole('button', { name: 'Plant in your forest' })).toBeNull();
  });

  it('never starts from a saved Home offline', async () => {
    await AsyncStorage.setItem(
      homeSnapshotKey(USER),
      JSON.stringify({ version: 1, savedAt: 1, home: makeHome({ pendingCeremony: SEPTEMBER }) }),
    );
    server.state.offline = true;
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: /Start Focus/ });
    await pause();
    expect(screen.queryByRole('button', { name: 'Plant in your forest' })).toBeNull();
  });

  it('waits while a focus session is running', async () => {
    await AsyncStorage.setItem(
      activeTimerKey(USER),
      JSON.stringify({
        version: 1,
        id: '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
        topicId: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
        plannedMinutes: 25,
        rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
        startedAt: Date.now() - 60_000,
        pauses: [],
        pausedAt: null,
        finished: null,
      }),
    );
    server.state.pendingCeremony = SEPTEMBER;
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: 'Resume focus' });
    await pause();
    expect(screen.queryByRole('button', { name: 'Plant in your forest' })).toBeNull();
  });

  it('plants the tree, reveals the new seed, then marks it seen and offers the recap', async () => {
    server.state.reducedMotion = false;
    await openHomeWithCeremony();
    fireEvent.press(screen.getByRole('button', { name: 'Plant in your forest' }));
    expect(await screen.findByTestId('ceremony-planting')).toBeOnTheScreen();
    expect(server.seen.ceremony).toEqual([]);
    expect(
      await screen.findByText('A new seed for October.', {}, { timeout: 6000 }),
    ).toBeOnTheScreen();
    await until(() => server.seen.ceremony.length === 1);
    expect(server.seen.ceremony).toEqual(['2026-9']);
    expect(screen.getByRole('button', { name: 'View recap' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeOnTheScreen();
  });

  it('under reduced motion, goes straight to the seed: same steps, no planting animation', async () => {
    await openHomeWithCeremony();
    fireEvent.press(screen.getByRole('button', { name: 'Plant in your forest' }));
    // A direct change: the seed is the very next state, never the settling animation.
    expect(screen.queryByTestId('ceremony-planting')).toBeNull();
    expect(screen.getByText('A new seed for October.')).toBeOnTheScreen();
    expect(screen.queryByTestId('ceremony-planting')).toBeNull();
    await until(() => server.seen.ceremony.length === 1);
  });

  it('is skippable, and a skip marks it seen once, then Home does not repeat it', async () => {
    await openHomeWithCeremony();
    fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    await screen.findByRole('button', { name: /Start Focus/ });
    await until(() => server.seen.ceremony.length === 1);
    await pause();
    expect(screen.queryByRole('button', { name: 'Plant in your forest' })).toBeNull();
    expect(server.seen.ceremony).toEqual(['2026-9']);
  });

  it('plays again after a kill before it was accepted: nothing was marked', async () => {
    await openHomeWithCeremony();
    screen.unmount();
    renderApp(appRoutes, { initialUrl: '/' });
    expect(await screen.findByRole('button', { name: 'Plant in your forest' })).toBeOnTheScreen();
    expect(server.seen.ceremony).toEqual([]);
  });

  it('when marking it seen fails, does not replay it, and sends the mark again later', async () => {
    server.state.ceremonySeenReply = { status: 503, body: nestError(503, 'Busy.') };
    await openHomeWithCeremony();
    fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    await screen.findByRole('button', { name: /Start Focus/ });
    await until(() => server.seen.ceremony.length >= 1);
    await pause();
    expect(screen.queryByRole('button', { name: 'Plant in your forest' })).toBeNull();
    const raw = JSON.parse((await AsyncStorage.getItem(celebrationsKey(USER)))!);
    expect(raw.ceremoniesShown).toEqual([SEPTEMBER]);

    // Next launch: the server still says pending; the mark is sent, not the ceremony shown.
    screen.unmount();
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: /Start Focus/ });
    await until(() => server.seen.ceremony.length === 2);
    await pause();
    expect(screen.queryByRole('button', { name: 'Plant in your forest' })).toBeNull();
    for (let i = 0; i < 100; i += 1) {
      const after = JSON.parse((await AsyncStorage.getItem(celebrationsKey(USER)))!);
      if (after.ceremoniesShown.length === 0) break;
      await pause(50);
    }
    const after = JSON.parse((await AsyncStorage.getItem(celebrationsKey(USER)))!);
    expect(after.ceremoniesShown).toEqual([]);
  });

  it('leads into the recap', async () => {
    await openHomeWithCeremony();
    fireEvent.press(screen.getByRole('button', { name: 'Plant in your forest' }));
    fireEvent.press(await screen.findByRole('button', { name: 'View recap' }));
    expect(await screen.findByText('Page 1 of 10')).toBeOnTheScreen();
    await until(() => server.seen.recap.length === 1);
  });
});

describe('monthly recap', () => {
  async function openRecap() {
    renderApp(appRoutes, { initialUrl: '/recap/2026/9' });
    await screen.findByText('Page 1 of 10');
  }
  const next = () => fireEvent.press(screen.getByRole('button', { name: 'Next' }));

  it('tells the month one idea per page, from the stored snapshot', async () => {
    await openRecap();
    expect(screen.getByRole('header', { name: 'September 2026' })).toBeOnTheScreen();
    expect(screen.UNSAFE_getByType(TreeScene).props.tree.ambience).toBe('at_rest');
    const pages: (string | RegExp)[] = [
      '25 h 10 min',
      '38 sessions over 19 active days',
      'Reading',
      '9 days',
      'Thursday, September 17 · 3 h 5 min',
      'Week of Monday, September 14 · 9 h',
      'Most focused day: 3 h 5 min',
      NOTE_TEXT,
    ];
    for (const [i, text] of pages.entries()) {
      next();
      expect(await screen.findByText(`Page ${i + 2} of 10`)).toBeOnTheScreen();
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
    next();
    expect(await screen.findByText('Page 10 of 10')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Share' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Go to Forest' })).toBeOnTheScreen();
    expect(
      requests.some((r) => r.url.includes('/me/sessions') || r.url.includes('/insights')),
    ).toBe(false);
  });

  it('leaves out what the month did not have, and never lists a shortfall', async () => {
    server.state.recap = makeRecap({
      stats: archivedStats({ topTopic: null, longestStreak: 0 }),
      mostProductiveWeek: null,
      newRecords: [],
      highlightedNotes: [],
    });
    renderApp(appRoutes, { initialUrl: '/recap/2026/9' });
    expect(await screen.findByText('Page 1 of 5')).toBeOnTheScreen();
  });

  it('marks the recap seen once it shows, not when only its data was loaded', async () => {
    await openRecap();
    await until(() => server.seen.recap.length === 1);
    expect(server.seen).toEqual({ recap: ['2026-9'], ceremony: [] });
  });

  it('shares an image of the clean card: no notes, no ids', async () => {
    const text = jest.spyOn(Share, 'share');
    await openRecap();
    for (let i = 0; i < 9; i += 1) next();
    const card = await screen.findByTestId('recap-share-card');
    expect(within(card).queryByText(NOTE_TEXT)).toBeNull();
    expect(within(card).getByText('25 h 10 min of focus')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    await until(() => jest.mocked(Sharing.shareAsync).mock.calls.length === 1);
    expect(jest.mocked(Sharing.shareAsync).mock.calls[0]![0]).toBe('file:///tmp/recap-card.png');
    expect(text).not.toHaveBeenCalled();
    const shown = within(card)
      .queryAllByText(/./)
      .map((node) => String(node.props.children))
      .join('\n');
    expect(shown).not.toContain(NOTE_TEXT);
    expect(shown).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(shown).not.toContain(USER);
  });
});
