import { fireEvent, screen } from 'expo-router/testing-library';

import type { HomeResponse } from '../api';
import { completionLine } from '../events/event-format';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makeChallenge } from '../test-utils/challenges';
import { makeCurrentTree, makeHome } from '../test-utils/core-loop';
import {
  EVENT_ID,
  makeCommunityTree,
  makeEvent,
  makeEventCard,
  makeSessionEventResult,
} from '../test-utils/events';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { treeDto } from '../test-utils/trees';
import { describeTree } from '../tree/describe-tree';
import { TreeScene } from '../tree/TreeScene';
import { knownTrait, toTreeVisualState, type TreeVisualState } from '../tree/visual-state';

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

/**
 * M5.4 Events & Community Tree (docs/05 → Events and Community Tree, Home; docs/02 Events,
 * Community Tree): events in Together, joining, missions from normal focus, rewards, Home's one
 * quiet card, the Community Tree scene with a shared total, and its celebration once.
 */
function eventsApi() {
  const state = {
    card: makeEventCard() as ReturnType<typeof makeEventCard> | null,
    event: makeEvent(),
    events: [makeEvent()],
    community: makeCommunityTree() as ReturnType<typeof makeCommunityTree> | null,
    joinAnswer: null as Reply | null,
    celebrated: [] as unknown[],
  };
  const handler = ({ url, method, body }: FakeRequest): Reply => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics') return { status: 200, body: [] };
    if (pathname === '/me/home') {
      const home: HomeResponse = {
        ...makeHome(),
        tree: treeDto({ stage: 'sprout' }),
        event: state.card,
      };
      return { status: 200, body: home };
    }
    if (pathname === '/me/trees/current') return { status: 200, body: makeCurrentTree() };
    if (pathname === '/me/profile')
      return {
        status: 200,
        body: {
          id: 'user-1',
          username: 'mai',
          displayName: 'Mai Anh',
          avatarUrl: null,
          bio: null,
          joinDate: '2026-09-26T10:00:00.000Z',
          timezone: 'Europe/Zurich',
        },
      };
    if (pathname === '/me/following' || pathname === '/me/followers')
      return { status: 200, body: { items: [], nextCursor: null } };
    if (pathname === '/me/warnings') return { status: 200, body: { items: [] } };
    if (pathname === '/me/reactions') return { status: 200, body: { items: [], nextCursor: null } };
    if (pathname === '/rooms') return { status: 200, body: { items: [] } };
    if (pathname === '/rooms/current') return { status: 200, body: { room: null } };
    if (pathname === '/me/challenges')
      return { status: 200, body: { current: [], invitations: [], finished: [] } };
    if (pathname === '/events') return { status: 200, body: { items: state.events } };
    if (pathname === `/events/${EVENT_ID}`) return { status: 200, body: state.event };
    if (pathname === `/events/${EVENT_ID}/join` && method === 'POST') {
      if (state.joinAnswer) return state.joinAnswer;
      state.event = makeEvent({ joined: true });
      return { status: 200, body: state.event };
    }
    if (pathname === `/events/${EVENT_ID}/community-tree`) {
      if (!state.community)
        return {
          status: 404,
          body: { ...nestError(404, 'No tree.'), code: 'community_tree_not_found' },
        };
      return { status: 200, body: state.community };
    }
    if (pathname === `/events/${EVENT_ID}/community-tree/celebrations` && method === 'POST') {
      state.celebrated.push(body);
      state.community = { ...state.community!, celebrate: [] };
      return { status: 204 };
    }
    return { status: 500, body: nestError(500, `Not in this test: ${method} ${pathname}`) };
  };
  return { handler, state };
}

let server: ReturnType<typeof eventsApi>;
let requests: FakeRequest[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  server = eventsApi();
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
const posts = (path: string) =>
  requests.filter((r) => new URL(r.url).pathname === path && r.method === 'POST');

async function openEvent() {
  const router = renderApp(appRoutes, { initialUrl: `/together/events/${EVENT_ID}` });
  await screen.findByRole('header', { name: 'Autumn Study' });
  return router;
}

describe("Home's one quiet event card (docs/05 Home: at most one, the tree stays the hero)", () => {
  it('shows the joined event with its missions, and opens it', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/' });
    const card = await screen.findByRole('button', { name: 'Autumn Study, 1 of 3 missions' });
    fireEvent.press(card);
    await screen.findByRole('header', { name: 'Autumn Study' });
    expect(router.getPathname()).toBe(`/together/events/${EVENT_ID}`);
  });

  it('invites to an event not joined yet, calmly', async () => {
    server.state.card = makeEventCard({ joined: false, phase: 'upcoming' });
    renderApp(appRoutes, { initialUrl: '/' });
    expect(
      await screen.findByRole('button', { name: 'Autumn Study, Starts 15 Oct' }),
    ).toBeOnTheScreen();
  });

  it('shows nothing when there is no event', async () => {
    server.state.card = null;
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: 'Start Focus' });
    await until(() => requests.some((r) => r.url === `${API}/me/home`));
    expect(screen.queryByRole('button', { name: /Autumn Study/ })).toBeNull();
  });
});

describe('Events in Together (docs/05 → Events)', () => {
  it('lists live and upcoming events, and opens one', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/together' });
    await shows('Events');
    fireEvent.press(
      await screen.findByRole('button', { name: /^Autumn Study, Live until 22 Oct/ }),
    );
    await screen.findByRole('header', { name: 'Autumn Study' });
    expect(router.getPathname()).toBe(`/together/events/${EVENT_ID}`);
  });
});

describe('an event (missions count normal focus; rewards owned forever)', () => {
  it('shows the window, the missions with progress, and the milestones with rewards', async () => {
    server.state.event = makeEvent({ reached: [true, false] });
    await openEvent();
    expect(screen.getByText('A week of steady autumn focus.')).toBeOnTheScreen();
    expect(screen.getByText('15 Oct – 22 Oct · Live until 22 Oct')).toBeOnTheScreen();
    expect(screen.getByText('Focus 5 hours · 3 h of 5 h')).toBeOnTheScreen();
    expect(screen.getByText('Focus on 3 days · 2 of 3 days')).toBeOnTheScreen();
    expect(screen.getByText('Focus together once · 0 of 1 session')).toBeOnTheScreen();
    expect(screen.getByText('First leaf · Reached')).toBeOnTheScreen();
    expect(screen.getByText('Maple Lanterns, and a keepsake on your tree')).toBeOnTheScreen();
    expect(screen.getByText('Full autumn · 2 missions')).toBeOnTheScreen();
    expect(screen.getByText('The Autumn Study badge')).toBeOnTheScreen();
  });

  it('joins, then shows progress from focus already done', async () => {
    server.state.event = makeEvent({ joined: false });
    await openEvent();
    expect(screen.getByText('Focus 5 hours · 5 h')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Join event' }));
    await shows('Focus 5 hours · 3 h of 5 h');
    expect(screen.queryByRole('button', { name: 'Join event' })).toBeNull();
    expect(posts(`/events/${EVENT_ID}/join`)).toHaveLength(1);
  });

  it('explains an entry condition, kindly', async () => {
    server.state.event = makeEvent({ joined: false });
    server.state.joinAnswer = {
      status: 422,
      body: {
        ...nestError(422, 'This event opens after 5 focus sessions.'),
        code: 'event_entry_not_met',
      },
    };
    await openEvent();
    fireEvent.press(screen.getByRole('button', { name: 'Join event' }));
    await shows('This event opens after 5 focus sessions.');
  });

  it('says an ended event simply ended, with no pressure', async () => {
    server.state.event = makeEvent({ joined: false, phase: 'ended' });
    await openEvent();
    expect(screen.getByText('15 Oct – 22 Oct · Ended')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Join event' })).toBeNull();
    expect(screen.queryByText(/hurry|last chance|missed|only \d+ days/i)).toBeNull();
  });

  it('leads to its Community Tree', async () => {
    const router = await openEvent();
    fireEvent.press(screen.getByRole('button', { name: /Community Tree/ }));
    await screen.findByRole('header', { name: 'The Garden Oak' });
    expect(router.getPathname()).toBe(`/together/community/${EVENT_ID}`);
  });
});

describe('the Community Tree (a warm shared number, never a race)', () => {
  async function openTree() {
    renderApp(appRoutes, { initialUrl: `/together/community/${EVENT_ID}` });
    await screen.findByRole('header', { name: 'The Garden Oak' });
  }

  it('shows the shared tree, its total, and its milestones, and nobody singled out', async () => {
    await openTree();
    expect(screen.getByTestId('community-tree-scene')).toBeOnTheScreen();
    expect(screen.getByText('12,340 minutes grown together by 230 people')).toBeOnTheScreen();
    expect(screen.getByText('Now in Bloom')).toBeOnTheScreen();
    expect(screen.getByText('You added 340 minutes')).toBeOnTheScreen();
    expect(screen.getByText('Seedling · 1,000 minutes · Reached')).toBeOnTheScreen();
    expect(screen.getByText('Final Form · 50,000 minutes')).toBeOnTheScreen();
    // No list, ranking, or share of any other person (docs/02).
    expect(screen.queryByText(/rank|top|most|least|%/i)).toBeNull();
  });

  it('draws the shared tree as a species of its own, pink in blossom (docs/03 §10)', async () => {
    await openTree();
    const tree = screen.UNSAFE_getByType(TreeScene).props.tree as TreeVisualState;
    expect(tree.species).toBe('shared-blossom');
    expect(tree.blossoms.level).toBe(tree.blossoms.max);
  });

  it('shows blossoms early: a growing shared tree already has some', async () => {
    server.state.community = makeCommunityTree({ stage: 'growing_tree' });
    await openTree();
    const tree = screen.UNSAFE_getByType(TreeScene).props.tree as TreeVisualState;
    expect(tree.blossoms.level).toBeGreaterThan(0);
    expect(tree.blossoms.level).toBeLessThan(tree.blossoms.max);
  });

  it('celebrates each new milestone once, then marks it seen', async () => {
    server.state.community = makeCommunityTree({ celebrate: ['bloom'] });
    await openTree();
    await shows('The Community Tree reached Bloom');
    await settleSheetTransitions();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await until(() => screen.queryByText('The Community Tree reached Bloom') === null);
    expect(server.state.celebrated).toEqual([{ stages: ['bloom'] }]);
  });

  it('shows no personal number before joining', async () => {
    server.state.community = makeCommunityTree({ joined: false });
    await openTree();
    expect(screen.queryByText(/You added/)).toBeNull();
  });
});

describe("Session Completion's one line (docs/05: mission or challenge progress)", () => {
  const events = { items: [makeEvent()] };
  const challenges = { current: [makeChallenge()], invitations: [], finished: [] };

  it('names a mission the session completed, first', () => {
    expect(completionLine([makeSessionEventResult()], events as never, challenges as never)).toBe(
      'Autumn Study · Mission complete: Focus 5 hours',
    );
  });

  it('otherwise counts the missions done', () => {
    const result = { ...makeSessionEventResult(), newlyCompletedMissionIds: [] };
    expect(completionLine([result], events as never, challenges as never)).toBe(
      'Autumn Study · 1 of 3 missions done',
    );
  });

  it('falls back to the challenge line, and to nothing', () => {
    expect(completionLine([], events as never, challenges as never)).toBe(
      '7 days of 15 min, together · 4 of 7 days',
    );
    expect(completionLine(null, events as never, null)).toBeNull();
  });
});

describe('event traits in the renderer (docs/03 §10)', () => {
  it('draws an event trait as a keepsake, and says so', () => {
    expect(knownTrait('event:autumn-study')).toEqual({
      id: 'event:autumn-study',
      family: 'event',
      value: 0,
    });
    const tree = toTreeVisualState(
      treeDto({ stage: 'young_tree', traits: ['event:autumn-study'] }),
    );
    expect(tree.traits.map((trait) => trait.id)).toEqual(['event:autumn-study']);
    expect(describeTree(tree, 'en-US')).toMatch(/event keepsake/i);
  });
});
