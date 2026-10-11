import { router as expoRouter } from 'expo-router';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { NetworkError, type HomeResponse } from '../api';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makeCurrentTree, makeHome } from '../test-utils/core-loop';
import { makeLifetime } from '../test-utils/insights';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import {
  KAI_ID,
  LINH_ID,
  makePrivacy,
  makeReactionSummary,
  makeSummary,
  makeVisitedForest,
  makeVisitedMonth,
  makeVisitedProfile,
  makeWarning,
} from '../test-utils/social';
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

/**
 * M5.1 Together & Social (docs/05 Together, Profile of a followed user; docs/02 Social, Privacy):
 * the Together tab's Following section, usernames, search, privacy-filtered profiles, forest
 * visits, quiet reactions, privacy settings, blocking, and reporting, over A5.1–A5.3.
 */
function socialApi() {
  const kai = makeSummary({ id: KAI_ID, username: 'kai', displayName: 'Kai' });
  const state = {
    offline: false,
    username: 'mai' as string | null,
    following: [makeSummary({}, { following: true, followedBy: true })],
    followers: [
      makeSummary({}, { following: true, followedBy: true }),
      { ...kai, relationship: { following: false, followedBy: true, friends: false } },
    ],
    blocks: [] as {
      id: string;
      username: string;
      displayName: string;
      avatarUrl: null;
      blockedAt: string;
    }[],
    warnings: [] as ReturnType<typeof makeWarning>[],
    received: [] as unknown[],
    profile: makeVisitedProfile() as ReturnType<typeof makeVisitedProfile> | null,
    reactions: {} as Record<string, string[]>,
    privacy: makePrivacy(),
    usernameAnswer: null as Reply | null,
    reports: [] as unknown[],
  };
  const summaryOf = (target: string) => {
    const mine = state.reactions[target] ?? [];
    return makeReactionSummary(target, Object.fromEntries(mine.map((kind) => [kind, 1])), mine);
  };
  const handler = ({ url, method, body }: FakeRequest): Reply | Promise<Reply> => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (state.offline) return new NetworkError();
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics') return { status: 200, body: [] };
    if (pathname === '/me/home') {
      const home: HomeResponse = { ...makeHome(), tree: treeDto({ stage: 'sprout' }) };
      return { status: 200, body: home };
    }
    if (pathname === '/me/trees/current') return { status: 200, body: makeCurrentTree() };
    if (pathname === '/me/profile') {
      if (method === 'PATCH') {
        if (state.usernameAnswer) return state.usernameAnswer;
        state.username = (body as { username: string }).username;
      }
      return {
        status: 200,
        body: {
          id: 'user-1',
          username: state.username,
          displayName: 'Mai Anh',
          avatarUrl: null,
          bio: null,
          joinDate: '2026-09-26T10:00:00.000Z',
          timezone: 'Europe/Zurich',
        },
      };
    }
    if (pathname === '/me/profile/stats') return { status: 200, body: makeLifetime() };
    if (pathname === '/me/following')
      return { status: 200, body: { items: state.following, nextCursor: null } };
    if (pathname === '/me/followers')
      return { status: 200, body: { items: state.followers, nextCursor: null } };
    if (pathname === '/me/warnings') return { status: 200, body: { items: state.warnings } };
    const ack = /^\/me\/warnings\/([^/]+)\/acknowledged$/.exec(pathname);
    if (ack && method === 'PUT') {
      // The server keeps answering an acknowledged warning, with its time.
      const warning = { ...state.warnings[0]!, acknowledgedAt: '2026-10-09T10:00:00.000Z' };
      state.warnings = [warning];
      return { status: 200, body: warning };
    }
    if (pathname === '/me/reactions')
      return { status: 200, body: { items: state.received, nextCursor: null } };
    if (pathname === '/users/search') {
      const q = searchParams.get('q') ?? '';
      const items = [makeSummary(), kai].filter((u) =>
        (u.username ?? '').startsWith(q.toLowerCase()),
      );
      return { status: 200, body: { items, nextCursor: null } };
    }
    const follow = /^\/me\/following\/([^/]+)$/.exec(pathname);
    if (follow && state.profile) {
      const following = method === 'PUT';
      state.following = following ? [makeSummary({}, { following: true, followedBy: true })] : [];
      const rel = state.profile.user.relationship;
      state.profile = {
        ...state.profile,
        user: {
          ...state.profile.user,
          relationship: { ...rel, following, friends: following && rel.followedBy },
        },
      };
      if (method === 'PUT')
        return {
          status: 200,
          body: { ...makeSummary(), relationship: state.profile.user.relationship },
        };
      return { status: 204 };
    }
    const block = /^\/me\/blocks\/([^/]+)$/.exec(pathname);
    if (block && method === 'PUT') {
      state.following = [];
      return { status: 204 };
    }
    if (block && method === 'DELETE') {
      state.blocks = state.blocks.filter((b) => b.id !== block[1]);
      return { status: 204 };
    }
    if (pathname === '/me/blocks')
      return { status: 200, body: { items: state.blocks, nextCursor: null } };
    if (pathname === '/me/reports' && method === 'POST') {
      state.reports.push(body);
      return {
        status: 201,
        body: {
          id: 'r1',
          category: (body as { category: string }).category,
          status: 'open',
          createdAt: '2026-10-09T10:00:00.000Z',
        },
      };
    }
    if (pathname === '/me/privacy') {
      if (method === 'PATCH') state.privacy = { ...state.privacy, ...(body as object) };
      return { status: 200, body: state.privacy };
    }
    if (pathname === `/users/${LINH_ID}/profile`) {
      if (!state.profile) return { status: 404, body: nestError(404, 'User not found.') };
      return { status: 200, body: state.profile };
    }
    if (pathname === `/users/${LINH_ID}/forest`) return { status: 200, body: makeVisitedForest() };
    if (pathname === `/users/${LINH_ID}/forest/2026/9`)
      return { status: 200, body: makeVisitedMonth() };
    const reaction = new RegExp(`^/users/${LINH_ID}/reactions(?:/([a-z]+))?$`).exec(pathname);
    if (reaction) {
      const target = searchParams.get('target')!;
      const kind = reaction[1];
      const mine = state.reactions[target] ?? [];
      if (kind && method === 'PUT') state.reactions[target] = [...new Set([...mine, kind])];
      if (kind && method === 'DELETE') state.reactions[target] = mine.filter((k) => k !== kind);
      return { status: 200, body: summaryOf(target) };
    }
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
  return { handler, state };
}

let server: ReturnType<typeof socialApi>;
let requests: FakeRequest[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  server = socialApi();
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
const calls = (path: string) =>
  requests
    .filter((r) => new URL(r.url).pathname === path && r.method !== 'GET')
    .map((r) => [r.method, `${new URL(r.url).pathname}${new URL(r.url).search}`, r.body]);

async function openTogether() {
  const router = renderApp(appRoutes, { initialUrl: '/together' });
  await screen.findByRole('header', { name: 'Together' });
  return router;
}

async function openPerson() {
  const router = renderApp(appRoutes, { initialUrl: `/together/${LINH_ID}` });
  await screen.findByRole('header', { name: 'Linh' });
  return router;
}

describe('the Together tab (docs/05 §1: Following in Phase 11)', () => {
  it('sits between Forest and Insights, and opens on the people the user follows', async () => {
    await openTogether();
    expect(screen.getByRole('tab', { name: 'Together' })).toBeSelected();
    await shows('Linh');
    expect(screen.getByText('@linh · Friends')).toBeOnTheScreen();
  });

  it('shows followers too, marking who follows the user back', async () => {
    await openTogether();
    fireEvent.press(await screen.findByRole('button', { name: 'Followers' }));
    await shows('Kai');
    expect(screen.getByText('@kai · Follows you')).toBeOnTheScreen();
  });

  it('invites the user to find people when they follow no one yet', async () => {
    server.state.following = [];
    const router = await openTogether();
    await shows('Follow friends to visit their forests.');
    fireEvent.press(screen.getAllByRole('button', { name: 'Find people' })[0]!);
    await screen.findByRole('header', { name: 'Find people' });
    expect(router.getPathname()).toBe('/together/search');
  });

  it('opens a person from the list', async () => {
    const router = await openTogether();
    fireEvent.press(await screen.findByRole('button', { name: /^Linh/ }));
    await screen.findByRole('header', { name: 'Linh' });
    expect(router.getPathname()).toBe(`/together/${LINH_ID}`);
  });

  it('asks for a username before anyone can find the user', async () => {
    server.state.username = null;
    const router = await openTogether();
    await shows('Choose a username so friends can find you.');
    fireEvent.press(screen.getByRole('button', { name: 'Choose a username' }));
    await screen.findByLabelText('Username');
    expect(router.getPathname()).toBe('/profile/edit');
  });

  it('shows a moderator warning until the user acknowledges it', async () => {
    server.state.warnings = [makeWarning()];
    await openTogether();
    await shows('Please keep your bio kind.');
    fireEvent.press(screen.getByRole('button', { name: 'I understand' }));
    await until(() => screen.queryByText('Please keep your bio kind.') === null);
    expect(calls('/me/warnings/0190a000-0000-7000-8000-00000000b001/acknowledged')).toEqual([
      ['PUT', '/me/warnings/0190a000-0000-7000-8000-00000000b001/acknowledged', undefined],
    ]);
  });

  it('lists the reactions the user received, quietly', async () => {
    server.state.received = [
      {
        id: 'x1',
        reaction: 'sparkles',
        target: 'forest',
        createdAt: '2026-10-08T10:00:00.000Z',
        from: makeSummary({ id: KAI_ID, username: 'kai', displayName: 'Kai' }),
      },
      {
        id: 'x2',
        reaction: 'fire',
        target: 'tree:2026-10',
        createdAt: '2026-10-08T09:00:00.000Z',
        from: makeSummary(),
      },
    ];
    await openTogether();
    await shows('Kai sent ✨');
    expect(screen.getByText('On your forest')).toBeOnTheScreen();
    expect(screen.getByText('Linh sent 🔥')).toBeOnTheScreen();
    expect(screen.getByText('On your October 2026 tree')).toBeOnTheScreen();
  });

  it('says calmly when the list cannot load', async () => {
    server.state.offline = true;
    await openTogether();
    await shows("We couldn't load the people you follow right now.");
  });
});

describe('choosing a username (A5.1)', () => {
  it('saves it from Edit profile', async () => {
    server.state.username = null;
    renderApp(appRoutes, { initialUrl: '/profile/edit' });
    fireEvent.changeText(await screen.findByLabelText('Username'), 'Mai_Anh');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await until(() => calls('/me/profile').length === 1);
    expect(calls('/me/profile')[0]![2]).toEqual({ username: 'mai_anh' });
  });

  it('explains a username that is taken, reserved, or not allowed', async () => {
    server.state.username = null;
    renderApp(appRoutes, { initialUrl: '/profile/edit' });
    const field = await screen.findByLabelText('Username');
    fireEvent.changeText(field, 'm!');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await shows('Use 3 to 20 letters, numbers, or underscores.');
    expect(calls('/me/profile')).toEqual([]);
    server.state.usernameAnswer = {
      status: 409,
      body: { ...nestError(409, 'That username is taken.'), code: 'username_taken' },
    };
    fireEvent.changeText(field, 'linh');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await shows('That username is taken. Try another one.');
  });
});

describe('finding people (A5.1 search)', () => {
  it('searches by username and opens a result', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/together/search' });
    fireEvent.changeText(await screen.findByLabelText('Username'), 'LI');
    await shows('@linh');
    expect(screen.queryByText('@kai')).toBeNull();
    expect(requests.some((r) => r.url === `${API}/users/search?q=li`)).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: /^Linh/ }));
    await screen.findByRole('header', { name: 'Linh' });
    expect(router.getPathname()).toBe(`/together/${LINH_ID}`);
  });

  it('says so when no one has that username', async () => {
    renderApp(appRoutes, { initialUrl: '/together/search' });
    fireEvent.changeText(await screen.findByLabelText('Username'), 'zz');
    await shows('No one has that username yet.');
  });
});

describe("a person's profile (A5.2: their tree is the hero, within their privacy)", () => {
  it('shows their tree, bio, permitted stats, showcase, and forest', async () => {
    await openPerson();
    expect(screen.getByText('@linh · Friends')).toBeOnTheScreen();
    expect(screen.getByText('Learning Japanese, one tree a month.')).toBeOnTheScreen();
    expect(screen.getByTestId('person-tree')).toBeOnTheScreen();
    await shows('12 h 34 min focused · 30 sessions');
    expect(screen.getByText('Longest streak 8 days')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /First Session/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Visit forest, 3 trees' })).toBeOnTheScreen();
    // Never a comparison with the viewer's own numbers (docs/02 Social).
    expect(screen.queryByText(/you|your/i)).toBeNull();
  });

  it('follows and unfollows', async () => {
    server.state.profile = makeVisitedProfile({ following: false, followedBy: true });
    await openPerson();
    expect(screen.getByText('@linh · Follows you')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Follow' }));
    await shows('@linh · Friends');
    fireEvent.press(screen.getByRole('button', { name: 'Unfollow' }));
    await shows('@linh · Follows you');
    expect(calls(`/me/following/${LINH_ID}`).map(([m]) => m)).toEqual(['PUT', 'DELETE']);
  });

  it('shows only what their privacy allows, and says some of it is private', async () => {
    server.state.profile = makeVisitedProfile(
      { following: false, followedBy: false },
      { currentTree: false, statistics: false, badges: false, forest: false, profile: false },
    );
    await openPerson();
    await shows("Some of Linh's profile is private.");
    expect(screen.queryByTestId('person-tree')).toBeNull();
    expect(screen.queryByText(/focused/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Visit forest/ })).toBeNull();
  });

  it('treats someone who is not there, or blocked, the same way', async () => {
    server.state.profile = null;
    renderApp(appRoutes, { initialUrl: `/together/${LINH_ID}` });
    await shows("This person isn't available.");
  });

  it('reacts to their tree with a quiet, positive reaction, and takes it back', async () => {
    await openPerson();
    const bar = await screen.findByTestId('reactions-tree:2026-10');
    fireEvent.press(within(bar).getByRole('button', { name: 'Sparkles, 0' }));
    const chosen = await within(bar).findByRole('button', { name: 'Sparkles, 1' });
    expect(chosen).toBeSelected();
    fireEvent.press(chosen);
    await within(bar).findByRole('button', { name: 'Sparkles, 0' });
    expect(calls(`/users/${LINH_ID}/reactions/sparkles`)).toEqual([
      ['PUT', `/users/${LINH_ID}/reactions/sparkles?target=tree%3A2026-10`, undefined],
      ['DELETE', `/users/${LINH_ID}/reactions/sparkles?target=tree%3A2026-10`, undefined],
    ]);
  });

  it('reacts to a showcase badge from its sheet', async () => {
    await openPerson();
    fireEvent.press(await screen.findByRole('button', { name: /First Session/ }));
    await settleSheetTransitions();
    const bar = await screen.findByTestId('reactions-badge:first-session');
    fireEvent.press(within(bar).getByRole('button', { name: 'Heart, 0' }));
    await within(bar).findByRole('button', { name: 'Heart, 1' });
  });

  it('sends no details when none are written', async () => {
    await openPerson();
    fireEvent.press(screen.getByRole('button', { name: 'Report' }));
    await settleSheetTransitions();
    fireEvent.press(screen.getByRole('button', { name: 'Account' }));
    fireEvent.changeText(screen.getByLabelText('Anything we should know? (optional)'), '   ');
    fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
    await shows('Thank you. A moderator will look at it.');
    expect(server.state.reports).toEqual([{ userId: LINH_ID, category: 'account', details: null }]);
  });

  it('adds someone followed from their profile to the Following list', async () => {
    server.state.following = [];
    server.state.profile = makeVisitedProfile({ following: false, followedBy: true });
    await openTogether();
    await shows('Follow friends to visit their forests.');
    fireEvent.press(screen.getAllByRole('button', { name: 'Find people' })[0]!);
    fireEvent.changeText(await screen.findByLabelText('Username'), 'li');
    fireEvent.press(await screen.findByRole('button', { name: /^Linh/ }));
    fireEvent.press(await screen.findByRole('button', { name: 'Follow' }));
    await shows('@linh · Friends');
    act(() => expoRouter.back());
    act(() => expoRouter.back());
    await screen.findByRole('header', { name: 'Together' });
    await until(() => screen.queryByText('Follow friends to visit their forests.') === null);
    expect(screen.getByRole('button', { name: /^Linh/ })).toBeOnTheScreen();
  });

  it('blocks after confirming, and leaves the profile', async () => {
    const router = await openPerson();
    fireEvent.press(screen.getByRole('button', { name: 'Block' }));
    await settleSheetTransitions();
    expect(screen.getByText(/won't be able to find you/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Block Linh' }));
    await until(() => router.getPathname() !== `/together/${LINH_ID}`);
    expect(calls(`/me/blocks/${LINH_ID}`)).toEqual([['PUT', `/me/blocks/${LINH_ID}`, undefined]]);
  });

  it('reports with a category and optional words', async () => {
    await openPerson();
    fireEvent.press(screen.getByRole('button', { name: 'Report' }));
    await settleSheetTransitions();
    const send = screen.getByRole('button', { name: 'Send report' });
    expect(send).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Bio' }));
    fireEvent.changeText(screen.getByLabelText('Anything we should know? (optional)'), 'Rude.');
    fireEvent.press(screen.getByRole('button', { name: 'Send report' }));
    await shows('Thank you. A moderator will look at it.');
    expect(server.state.reports).toEqual([{ userId: LINH_ID, category: 'bio', details: 'Rude.' }]);
  });
});

describe('visiting a forest (A5.2: their trees, never a stats comparison)', () => {
  it('shows their months as trees, and reacts to the forest', async () => {
    renderApp(appRoutes, { initialUrl: `/together/${LINH_ID}/forest` });
    await screen.findByRole('header', { name: "Linh's forest" });
    expect(await screen.findByRole('button', { name: /September 2026/ })).toBeOnTheScreen();
    expect(screen.getByText('A quiet month')).toBeOnTheScreen();
    const bar = screen.getByTestId('reactions-forest');
    fireEvent.press(within(bar).getByRole('button', { name: 'Clap, 0' }));
    await within(bar).findByRole('button', { name: 'Clap, 1' });
  });

  it('opens an archived month with its permitted record', async () => {
    renderApp(appRoutes, { initialUrl: `/together/${LINH_ID}/forest` });
    fireEvent.press(await screen.findByRole('button', { name: /September 2026/ }));
    await settleSheetTransitions();
    await shows('21 h focused · 31 sessions');
    expect(screen.getByText('First Session')).toBeOnTheScreen();
    expect(screen.getByTestId('reactions-tree:2026-09')).toBeOnTheScreen();
  });
});

describe('privacy and blocked users (Settings, docs/05 §2)', () => {
  it('changes who sees each part of the profile, and the leaderboard opt-in', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/profile/settings' });
    fireEvent.press(await screen.findByRole('button', { name: 'Privacy' }));
    await screen.findByRole('header', { name: 'Privacy' });
    expect(router.getPathname()).toBe('/profile/privacy');
    const forest = await screen.findByTestId('privacy-forest');
    expect(within(forest).getByRole('button', { name: 'Friends' })).toBeSelected();
    fireEvent.press(within(forest).getByRole('button', { name: 'Public' }));
    await until(() => calls('/me/privacy').length === 1);
    expect(calls('/me/privacy')[0]![2]).toEqual({ forest: 'public' });
    await until(
      () =>
        within(screen.getByTestId('privacy-forest')).getByRole('button', { name: 'Public' }).props
          .accessibilityState?.selected === true,
    );
    fireEvent(screen.getByRole('switch', { name: /Appear on leaderboards/ }), 'valueChange', true);
    await until(() => calls('/me/privacy').length === 2);
    expect(calls('/me/privacy')[1]![2]).toEqual({ leaderboards: true });
  });

  it('lists blocked people and unblocks after confirming', async () => {
    server.state.blocks = [
      {
        id: KAI_ID,
        username: 'kai',
        displayName: 'Kai',
        avatarUrl: null,
        blockedAt: '2026-10-08T10:00:00.000Z',
      },
    ];
    renderApp(appRoutes, { initialUrl: '/profile/settings' });
    fireEvent.press(await screen.findByRole('button', { name: 'Blocked people' }));
    await screen.findByRole('header', { name: 'Blocked people' });
    await shows('Kai');
    fireEvent.press(screen.getByRole('button', { name: 'Unblock Kai' }));
    await settleSheetTransitions();
    // The confirmation's button, after the row's own.
    fireEvent.press(screen.getAllByRole('button', { name: 'Unblock' }).at(-1)!);
    await shows('You have not blocked anyone.');
    expect(calls(`/me/blocks/${KAI_ID}`)).toEqual([['DELETE', `/me/blocks/${KAI_ID}`, undefined]]);
  });
});
