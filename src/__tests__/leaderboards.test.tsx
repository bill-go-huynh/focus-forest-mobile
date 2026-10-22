import { fireEvent, screen, within } from 'expo-router/testing-library';

import type { HomeResponse } from '../api';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makeCurrentTree, makeHome } from '../test-utils/core-loop';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { until } from '../test-utils/sheets';
import { KAI_ID, LINH_ID, makePrivacy } from '../test-utils/social';
import { treeDto } from '../test-utils/trees';

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

const API = 'https://api.example.com';
type Reply = { status: number; body?: unknown } | Error;

const person = (id: string, displayName: string, username: string) => ({
  id,
  username,
  displayName,
  avatarUrl: null,
});
const row = (rank: number, who: ReturnType<typeof person>, score: number, you = false) => ({
  rank,
  person: who,
  score,
  you,
});
const ME = person('user-1', 'Mai Anh', 'mai');
const LINH = person(LINH_ID, 'Linh', 'linh');
const KAI = person(KAI_ID, 'Kai', 'kai');

function makeBoard(
  overrides: {
    scope?: string;
    kind?: string;
    optedIn?: boolean;
    rows?: ReturnType<typeof row>[];
    you?: ReturnType<typeof row> | null;
  } = {},
) {
  const rows = overrides.rows ?? [row(1, LINH, 607), row(2, ME, 450, true), row(2, KAI, 450)];
  return {
    scope: overrides.scope ?? 'friends',
    period: {
      kind: overrides.kind ?? 'weekly',
      startDate: '2026-10-12',
      endDate: '2026-10-18',
    },
    optedIn: overrides.optedIn ?? true,
    rows,
    you: overrides.you === undefined ? (rows.find((r) => r.you) ?? null) : overrides.you,
  };
}

/**
 * M5.5 Leaderboards (docs/05 → Leaderboards; docs/02: fair, opt-in, friends first; docs/01: a
 * plain readable list with the user's own row highlighted, no podium; docs/11: plain list).
 */
function boardsApi() {
  const state = {
    boards: {} as Record<string, unknown>,
    fallback: makeBoard() as unknown,
  };
  const handler = ({ url }: FakeRequest): Reply => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics') return { status: 200, body: [] };
    if (pathname === '/me/home') {
      const home: HomeResponse = { ...makeHome(), tree: treeDto({ stage: 'sprout' }) };
      return { status: 200, body: home };
    }
    if (pathname === '/me/trees/current') return { status: 200, body: makeCurrentTree() };
    if (pathname === '/me/profile')
      return {
        status: 200,
        body: {
          id: ME.id,
          username: 'mai',
          displayName: 'Mai Anh',
          avatarUrl: null,
          bio: null,
          joinDate: '2026-09-26T10:00:00.000Z',
          timezone: 'Europe/Zurich',
        },
      };
    if (pathname === '/me/privacy') return { status: 200, body: makePrivacy() };
    if (pathname === '/me/following' || pathname === '/me/followers')
      return { status: 200, body: { items: [], nextCursor: null } };
    if (pathname === '/me/warnings') return { status: 200, body: { items: [] } };
    if (pathname === '/me/reactions') return { status: 200, body: { items: [], nextCursor: null } };
    if (pathname === '/rooms') return { status: 200, body: { items: [] } };
    if (pathname === '/rooms/current') return { status: 200, body: { room: null } };
    if (pathname === '/me/challenges')
      return { status: 200, body: { current: [], invitations: [], finished: [] } };
    if (pathname === '/leaderboards') {
      const key = `${searchParams.get('scope')}/${searchParams.get('period')}`;
      return { status: 200, body: state.boards[key] ?? state.fallback };
    }
    return { status: 500, body: nestError(500, `Not in this test: ${pathname}`) };
  };
  return { handler, state };
}

let server: ReturnType<typeof boardsApi>;
let requests: FakeRequest[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  server = boardsApi();
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
const boardRequests = () =>
  requests
    .filter((r) => new URL(r.url).pathname === '/leaderboards')
    .map((r) => new URL(r.url).search);

async function openBoard(query = '') {
  const router = renderApp(appRoutes, { initialUrl: `/together/leaderboards${query}` });
  await screen.findByRole('header', { name: 'Leaderboards' });
  return router;
}

describe('Leaderboards in Together (docs/05 → Leaderboards)', () => {
  it('opens from Together, on friends and this week by default', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/together' });
    fireEvent.press(await screen.findByRole('button', { name: /^Leaderboards/ }));
    await screen.findByRole('header', { name: 'Leaderboards' });
    expect(router.getPathname()).toBe('/together/leaderboards');
    await shows('Linh');
    expect(boardRequests()).toEqual(['?scope=friends&period=weekly']);
    expect(screen.getByRole('button', { name: 'Friends' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'This week' })).toBeSelected();
  });
});

describe("a board (a plain list; fair scores; the user's own row highlighted)", () => {
  it("lists ranks and scores, ties sharing a rank, with the user's own row marked", async () => {
    await openBoard();
    const list = await screen.findByTestId('leaderboard-rows');
    const rows = within(list).getAllByTestId('leaderboard-row');
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      'Rank 1, Linh, 607',
      'Rank 2, Mai Anh, you, 450',
      'Rank 2, Kai, 450',
    ]);
    expect(screen.getByText('12 Oct – 18 Oct')).toBeOnTheScreen();
    // Listed once: no second row for the user, and no opt-in note for someone opted in.
    expect(screen.queryByTestId('leaderboard-you')).toBeNull();
    expect(screen.queryByText(/You're not on leaderboards/)).toBeNull();
    // The fair score, said plainly; never raw hours, never a podium or a drop.
    expect(screen.getByText(/never hours alone/)).toBeOnTheScreen();
    expect(screen.queryByText(/🥇|🏆|dropped|fell|behind/i)).toBeNull();
  });

  it('switches to the global board and to this month', async () => {
    server.state.boards['global/weekly'] = makeBoard({ scope: 'global', rows: [row(1, KAI, 700)] });
    server.state.boards['global/monthly'] = makeBoard({
      scope: 'global',
      kind: 'monthly',
      rows: [row(1, KAI, 300)],
    });
    await openBoard();
    fireEvent.press(await screen.findByRole('button', { name: 'Global' }));
    await shows('700');
    fireEvent.press(screen.getByRole('button', { name: 'This month' }));
    await shows('300');
    expect(boardRequests()).toEqual([
      '?scope=friends&period=weekly',
      '?scope=global&period=weekly',
      '?scope=global&period=monthly',
    ]);
  });

  it("shows the user's own row after the list when they are further down", async () => {
    server.state.fallback = makeBoard({
      rows: [row(1, LINH, 607)],
      you: row(51, ME, 121, true),
    });
    await openBoard();
    await shows('Linh');
    expect(screen.getByTestId('leaderboard-you').props.accessibilityLabel).toBe(
      'Rank 51, Mai Anh, you, 121',
    );
  });

  it('says a fresh period is empty so far, kindly', async () => {
    server.state.fallback = makeBoard({ rows: [], you: null });
    await openBoard();
    await shows('Nobody is on this board yet. Each week starts fresh.');
  });

  it('says a fresh month is empty in its own words', async () => {
    server.state.boards['friends/monthly'] = makeBoard({ kind: 'monthly', rows: [], you: null });
    await openBoard();
    fireEvent.press(await screen.findByRole('button', { name: 'This month' }));
    await shows('Nobody is on this board yet. Each month starts fresh.');
  });

  it('lets someone who has not opted in read it, and says how to appear', async () => {
    server.state.fallback = makeBoard({ optedIn: false, rows: [row(1, LINH, 607)], you: null });
    const router = await openBoard();
    await shows(/You're not on leaderboards/);
    fireEvent.press(screen.getByRole('button', { name: 'Privacy settings' }));
    await screen.findByRole('header', { name: 'Privacy' });
    expect(router.getPathname()).toBe('/profile/privacy');
  });
});
