import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

import { submittedSessionSchema } from '../api/sessions';
import { celebrationsKey, CelebrationStore } from '../celebrations/celebration-store';
import { growthMoment } from '../core-loop/presentation';
import { sceneClock } from '../core-loop/scene-clock';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { mockAppState } from '../test-utils/app-state';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { memoryStorage } from '../test-utils/storage';
import contract from '../test-utils/x3/core-loop-contract.json';

/**
 * X3 (Core Loop integration), mobile side: the app's real stores, hooks, queries, and screens
 * against the exact answers captured from the real API (HTTP + PostgreSQL) in
 * focus-forest-api test/x3/contract-capture.int-spec.ts. Nothing here builds a server answer by
 * hand, so no backend rule is restated in a fixture.
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
/** The captured user (ids in the capture are made stable). */
const USER = contract.profile.id;
const NOTE = contract.treeArchived.highlightedNotes[0]!.note;
const session = (name: 'sessionFirst' | 'sessionDiscarded' | 'sessionOctober' | 'sessionLate') =>
  submittedSessionSchema.parse(contract[name]);

type Reply = { status: number; body?: unknown } | Error;

/** Serves the captured answers by path; records the seen marks. */
function capturedApi() {
  const state = { home: contract.homeAfterClose as unknown };
  const seen: string[] = [];
  const handler = ({ url, method }: FakeRequest): Reply => {
    const { pathname, searchParams } = new URL(url);
    const ok = (body: unknown): Reply => ({ status: 200, body });
    if (pathname === '/me/preferences') return ok(makePreferences({ reducedMotion: true }));
    if (pathname === '/session-rules')
      return ok({ version: 1, minValidMinutes: 5, maxPauseMinutes: 30 });
    if (pathname === '/me/topics') {
      const status = searchParams.get('status');
      return ok(contract.topics.filter((topic) => !status || topic.status === status));
    }
    if (pathname === '/me/home') return ok(state.home);
    if (pathname === '/me/trees/current') return ok(contract.treeGrowing);
    if (pathname === '/me/forest') return ok(contract.forest);
    if (pathname === '/me/goals') return ok(contract.goals);
    if (pathname === '/me/rest-days') return ok(contract.restDays);
    if (pathname === '/me/streak') return ok(contract.streak);
    if (pathname === '/me/profile') return ok(contract.profile);
    if (pathname === '/me/profile/stats') return ok(contract.profileStats);
    if (pathname === '/me/insights/week') return ok(contract.insightsWeek);
    if (pathname === '/me/insights/month') return ok(contract.insightsMonth);
    if (pathname === '/me/insights/heatmap') return ok(contract.heatmap);
    if (pathname === '/me/insights/records') return ok(contract.records);
    if (pathname === '/me/sessions') {
      return ok(searchParams.get('topicId') ? contract.historyTopic : contract.historySeptember);
    }
    if (pathname === '/me/trees/2026/9/ceremony-seen' && method === 'PUT') {
      seen.push('ceremony');
      return ok(contract.ceremonySeen);
    }
    if (pathname === '/me/trees/2026/9/recap-seen' && method === 'PUT') {
      seen.push('recap');
      return ok({ ...contract.ceremonySeen, recapSeenAt: '2026-10-02T22:10:00.000Z' });
    }
    if (pathname === '/me/trees/2026/9/recap') return ok(contract.recap);
    if (pathname === '/me/trees/2026/9') return ok(contract.treeArchived);
    if (pathname === '/me/trees/2026/8') return ok(contract.treeResting);
    if (pathname === '/me/trees/2026/10') return ok(contract.treeGrowing);
    return { status: 500, body: nestError(500, 'Not captured.') };
  };
  return { handler, state, seen };
}

let server: ReturnType<typeof capturedApi>;
let requests: FakeRequest[];
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = API;
  await AsyncStorage.clear();
  signInForTest({ id: USER, email: 'mai@example.com' });
  server = capturedApi();
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
  mockAppState();
  jest.spyOn(sceneClock, 'now').mockImplementation(() => new Date(2026, 9, 2, 12, 0).getTime());
});
afterEach(async () => {
  await settleSheetTransitions();
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
const pause = (ms = 300) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const storedCelebrations = async () =>
  JSON.parse((await AsyncStorage.getItem(celebrationsKey(USER))) ?? 'null') as {
    pending: { sessionId: string }[];
    consumed: string[];
  } | null;

describe('X3 celebrations from the captured growth results', () => {
  const OTHER = '00000000-0000-4000-8000-0000000000bb';
  async function ready(storage = memoryStorage(), userId = USER) {
    const store = new CelebrationStore({ storage, report: () => undefined });
    await store.activate(userId);
    return { store, storage };
  }
  const pendingIds = (store: CelebrationStore) =>
    store.getSnapshot().pending.map((intent) => intent.sessionId);

  it('keeps only real growth of an open month: no discarded, closed-month, or invented moment', async () => {
    const { store } = await ready();
    for (const name of ['sessionDiscarded', 'sessionLate'] as const) {
      await expect(store.record(USER, session(name))).resolves.toBe(true);
    }
    expect(pendingIds(store)).toEqual([]);
    await store.record(USER, session('sessionFirst'));
    expect(store.getSnapshot().pending[0]!.growth).toEqual(contract.sessionFirst.growth);
  });

  it('records a replayed or twice-delivered answer once, in session order, and consumes it once', async () => {
    const { store, storage } = await ready();
    await store.record(USER, session('sessionOctober'));
    await store.record(USER, session('sessionFirst'));
    await store.record(USER, session('sessionFirst'));
    expect(pendingIds(store)).toEqual([contract.sessionFirst.id, contract.sessionOctober.id]);
    await store.consume(USER, [contract.sessionFirst.id]);
    // A kill, then the same answer again (a duplicate sync callback): never shown again.
    const relaunched = await ready(storage);
    await relaunched.store.record(USER, session('sessionFirst'));
    expect(pendingIds(relaunched.store)).toEqual([contract.sessionOctober.id]);
  });

  it('never gives one user’s growth to another', async () => {
    const storage = memoryStorage();
    const ada = await ready(storage);
    await ada.store.record(USER, session('sessionFirst'));
    const other = await ready(storage, OTHER);
    expect(pendingIds(other.store)).toEqual([]);
    expect(pendingIds((await ready(storage)).store)).toEqual([contract.sessionFirst.id]);
  });
});

describe('X3 Home: a synced growth and a pending month ceremony at the first open of a month', () => {
  it('shows the growth first, then opens the server’s ceremony once, never stacked', async () => {
    const october = session('sessionOctober');
    await AsyncStorage.setItem(
      celebrationsKey(USER),
      JSON.stringify({
        version: 1,
        pending: [{ sessionId: october.id, startedAt: october.startedAt, growth: october.growth }],
        consumed: [],
      }),
    );
    renderApp(appRoutes, { initialUrl: '/' });
    // The growth moment plays first, alone.
    await screen.findByText(growthMoment([october.growth!]).caption);
    expect(screen.queryByRole('button', { name: 'Plant in your forest' })).toBeNull();
    await screen.findByRole('button', { name: 'Plant in your forest' });
    // By then the growth was shown and consumed: it is not lost, and not shown again.
    expect(await storedCelebrations()).toMatchObject({ pending: [], consumed: [october.id] });
    expect(screen.getByRole('header', { name: 'September 2026' })).toBeOnTheScreen();
    // Shown, not yet accepted: nothing marked; Skip marks it once.
    expect(server.seen).toEqual([]);
    fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    await until(() => server.seen.length === 1);
    await pause();
    expect(server.seen).toEqual(['ceremony']);
  });
});

describe('X3 Forest → archived month → recap → share, from captured answers', () => {
  it('reads every month, opens the archive’s snapshot, and shares a card without private data', async () => {
    const text = jest.spyOn(Share, 'share');
    renderApp(appRoutes, { initialUrl: '/forest' });
    await screen.findByTestId('forest-landscape');
    fireEvent.press(screen.getByRole('button', { name: 'List view' }));
    const list = within(await screen.findByTestId('forest-list'));
    const labels = list.getAllByRole('button').map((row) => String(row.props.accessibilityLabel));
    expect(labels).toEqual([
      expect.stringMatching(/^October 2026, growing now, .*40 minutes focused so far$/),
      expect.stringMatching(/^September 2026, .*6 hours 20 minutes focused/),
      'August 2026, a quiet month, no focus recorded',
    ]);

    fireEvent.press(list.getByRole('button', { name: /^September 2026/ }));
    await shows(NOTE);
    fireEvent.press(screen.getByRole('button', { name: 'View recap' }));
    const total = await screen.findByText(/^Page 1 of (\d+)$/);
    const pages = Number(/of (\d+)/.exec(String(total.props.children))![1]);
    for (let i = 1; i < pages; i += 1) {
      fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    }
    const card = await screen.findByTestId('recap-share-card');
    const shown = within(card)
      .queryAllByText(/./)
      .map((node) => String(node.props.children))
      .join('\n');
    expect(shown).toContain('6 h 20 min of focus');
    for (const secret of [
      NOTE,
      USER,
      contract.recap.stats.topTopic!.id,
      contract.recap.stats.topTopic!.name,
      ...contract.recap.highlightedNotes.map((n) => n.sessionId),
      'mai@example.com',
    ]) {
      expect(shown).not.toContain(secret);
    }
    expect(shown).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    await until(() => jest.mocked(Sharing.shareAsync).mock.calls.length === 1);
    expect(text).not.toHaveBeenCalled();
    expect(server.seen).toEqual(['recap']);
    fireEvent.press(screen.getByRole('button', { name: 'Go to Forest' }));
    await screen.findByTestId('forest-landscape');
  });
});

describe('X3 Insights → History, from captured answers', () => {
  it('binds each weekly metric to its own field and explains the late session', async () => {
    renderApp(appRoutes, { initialUrl: '/insights' });
    // The week: this week's weekly goal progress.
    await shows('Weekly goal reached: 280 / 150 min');
    fireEvent.press(screen.getByRole('button', { name: 'Month' }));
    // The month: the Monday-owned rate (0 of 3), never the archive's count (1).
    await shows('Weekly goal met in 0 of 3 weeks');
    expect(screen.queryByText(/Weekly goal met in 1/)).toBeNull();
    expect(screen.queryByText(/280/)).toBeNull();
    // Raw numbers include the late session; the archive stays as saved, and says so.
    await shows(
      'Insights include sessions synced later. Your archived tree stays as it was saved.',
    );
    // Topics by name (archived or not), never an id; a topic filters the history.
    const topics = within(screen.getByTestId('insights-topics'));
    expect(topics.queryByText(/[0-9a-f]{8}-[0-9a-f]{4}-/)).toBeNull();
    fireEvent.press(topics.getByRole('button', { name: /^Writing/ }));
    await until(() =>
      requests.some((r) => r.url.includes('topicId=00000000-0000-4000-8000-000000009001')),
    );
    await shows(/Showing: .*Writing/);
  });

  it('shows the history of the month with discarded sessions visible and not counted', async () => {
    renderApp(appRoutes, { initialUrl: '/insights' });
    await screen.findByTestId('history-filters');
    await shows(/Not counted/);
  });
});

describe('X3 Profile lifetime stats, from captured answers', () => {
  it('shows the server’s lifetime numbers with the profile’s join date', async () => {
    renderApp(appRoutes, { initialUrl: '/profile' });
    const lifetime = within(await screen.findByTestId('profile-lifetime'));
    expect(lifetime.getByText(/7 h 35 min|7 hours 35 minutes/)).toBeOnTheScreen();
    expect(screen.getByText(/Joined/)).toBeOnTheScreen();
  });
});
