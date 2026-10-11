import { fireEvent, screen } from 'expo-router/testing-library';

import type { HomeResponse } from '../api';
import { completionChallengeLine } from '../challenges/challenge-format';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import {
  CHALLENGE_ID,
  KAI,
  LINH,
  makeChallenge,
  ME,
  STEADY_WEEK,
  TEAM_FIFTY,
  TEMPLATES,
  TEN_HOURS_WEEK,
  THIRTY_SESSIONS,
} from '../test-utils/challenges';
import { makeCurrentTree, makeHome } from '../test-utils/core-loop';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { makeSummary } from '../test-utils/social';
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
type Challenge = ReturnType<typeof makeChallenge>;

/**
 * M5.3 Challenges (docs/05 → Challenges; docs/02 Social: cooperative over competitive): the
 * Challenges section in Together, starting one from a template, inviting friends, invitations,
 * shared progress from everyone's normal focus, leaving without penalty, and the completion line.
 */
function challengesApi() {
  const state = {
    current: [makeChallenge()] as Challenge[],
    invitations: [] as Challenge[],
    finished: [] as Challenge[],
    detail: makeChallenge() as Challenge,
    created: [] as unknown[],
    invited: [] as unknown[],
    inviteAnswer: null as Reply | null,
  };
  const handler = ({ url, method, body }: FakeRequest): Reply => {
    const { pathname } = new URL(url);
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
    if (pathname === '/me/following')
      return {
        status: 200,
        body: {
          items: [
            makeSummary({}, { following: true, followedBy: true }),
            makeSummary(
              { id: KAI.id, username: 'kai', displayName: 'Kai' },
              { following: true, followedBy: false },
            ),
          ],
          nextCursor: null,
        },
      };
    if (pathname === '/me/followers') return { status: 200, body: { items: [], nextCursor: null } };
    if (pathname === '/me/warnings') return { status: 200, body: { items: [] } };
    if (pathname === '/me/reactions') return { status: 200, body: { items: [], nextCursor: null } };
    if (pathname === '/rooms') return { status: 200, body: { items: [] } };
    if (pathname === '/rooms/current') return { status: 200, body: { room: null } };
    if (pathname === '/challenge-templates') return { status: 200, body: { items: TEMPLATES } };
    if (pathname === '/me/challenges' && method === 'GET')
      return {
        status: 200,
        body: { current: state.current, invitations: state.invitations, finished: state.finished },
      };
    if (pathname === '/me/challenges' && method === 'POST') {
      state.created.push(body);
      const template =
        TEMPLATES.find((t) => t.id === (body as { templateId: string }).templateId) ?? STEADY_WEEK;
      state.detail = makeChallenge({
        template,
        value: 0,
        participants: [{ user: ME, value: 0, reached: false }],
        invited: ((body as { invite?: string[] }).invite ?? []).map((id) =>
          id === LINH.id ? LINH : KAI,
        ),
      });
      return { status: 201, body: state.detail };
    }
    if (pathname === `/me/challenges/${CHALLENGE_ID}`) return { status: 200, body: state.detail };
    if (pathname === `/me/challenges/${CHALLENGE_ID}/invite`) {
      if (state.inviteAnswer) return state.inviteAnswer;
      state.invited.push(body);
      state.detail = { ...state.detail, invited: [LINH] };
      return { status: 200, body: state.detail };
    }
    if (pathname === `/me/challenges/${CHALLENGE_ID}/accept`) {
      state.invitations = [];
      state.detail = makeChallenge({
        participants: [
          { user: LINH, value: 7, reached: true },
          { user: ME, value: 0, reached: false },
        ],
        value: 0,
      });
      state.current = [state.detail];
      return { status: 200, body: state.detail };
    }
    if (pathname === `/me/challenges/${CHALLENGE_ID}/decline`) {
      state.invitations = [];
      return { status: 204 };
    }
    if (pathname === `/me/challenges/${CHALLENGE_ID}/leave`) {
      state.current = [];
      return { status: 204 };
    }
    return { status: 500, body: nestError(500, `Not in this test: ${method} ${pathname}`) };
  };
  return { handler, state };
}

let server: ReturnType<typeof challengesApi>;
let requests: FakeRequest[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  server = challengesApi();
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
  requests
    .filter((r) => new URL(r.url).pathname === path && r.method === 'POST')
    .map((r) => r.body);

const progressText = () =>
  (
    screen.getByRole('progressbar', { name: 'Challenge progress' }).props as {
      accessibilityValue: { text: string };
    }
  ).accessibilityValue.text;

async function openDetail() {
  const router = renderApp(appRoutes, { initialUrl: `/together/challenges/${CHALLENGE_ID}` });
  await screen.findByRole('header', { name: '7 days of 15 min, together' });
  return router;
}

describe('Challenges in Together (docs/05 → Challenges)', () => {
  it('shows current challenges with their shared progress, and opens one', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/together' });
    await shows('Challenges');
    fireEvent.press(
      await screen.findByRole('button', { name: '7 days of 15 min, together, 4 of 7 days' }),
    );
    await screen.findByRole('header', { name: '7 days of 15 min, together' });
    expect(router.getPathname()).toBe(`/together/challenges/${CHALLENGE_ID}`);
  });

  it('accepts an invitation, which joins the challenge', async () => {
    server.state.current = [];
    server.state.invitations = [makeChallenge({ you: 'invited' })];
    renderApp(appRoutes, { initialUrl: '/together' });
    await shows('Invitations');
    fireEvent.press(screen.getByRole('button', { name: 'Accept 7 days of 15 min, together' }));
    await shows('0 of 7 days');
    expect(posts(`/me/challenges/${CHALLENGE_ID}/accept`)).toEqual([undefined]);
  });

  it('declines an invitation quietly', async () => {
    server.state.current = [];
    server.state.invitations = [makeChallenge({ you: 'invited' })];
    renderApp(appRoutes, { initialUrl: '/together' });
    fireEvent.press(
      await screen.findByRole('button', { name: 'Decline 7 days of 15 min, together' }),
    );
    await until(() => screen.queryByText('Invitations') === null);
    expect(posts(`/me/challenges/${CHALLENGE_ID}/decline`)).toEqual([undefined]);
  });
});

describe('starting a challenge (cooperative and consistency formats, no races)', () => {
  it('starts a personal challenge from a template', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/together' });
    fireEvent.press(await screen.findByRole('button', { name: 'Start a challenge' }));
    await screen.findByRole('header', { name: 'Start a challenge' });
    expect(router.getPathname()).toBe('/together/challenges/new');
    fireEvent.press(await screen.findByRole('button', { name: /^10 hours in 7 days/ }));
    fireEvent.press(screen.getByRole('button', { name: 'Start challenge' }));
    await screen.findByRole('header', { name: '10 hours in 7 days' });
    expect(server.state.created).toEqual([{ templateId: TEN_HOURS_WEEK.id }]);
  });

  it('names each template by what it asks, and who takes part', async () => {
    renderApp(appRoutes, { initialUrl: '/together/challenges/new' });
    await screen.findByRole('button', { name: /^10 hours in 7 days, Just you/ });
    expect(
      screen.getByRole('button', { name: /^30 sessions in 30 days, Just you/ }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /^7 days of 15 min, together, With friends, up to 5/ }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /^50 hours as a team in 7 days, Group, up to 10/ }),
    ).toBeOnTheScreen();
    // Never a race (docs/02 rule 13).
    expect(screen.queryByText(/first to|race|win/i)).toBeNull();
  });

  it('invites friends (mutual follows only) when starting a friend challenge', async () => {
    renderApp(appRoutes, { initialUrl: '/together/challenges/new' });
    fireEvent.press(await screen.findByRole('button', { name: /^7 days of 15 min, together/ }));
    await shows('Invite friends');
    const linh = await screen.findByRole('button', { name: 'Linh' });
    // Kai is followed but does not follow back: not a friend, not offered.
    expect(screen.queryByRole('button', { name: 'Kai' })).toBeNull();
    fireEvent.press(linh);
    fireEvent.press(screen.getByRole('button', { name: 'Start challenge' }));
    await screen.findByRole('header', { name: '7 days of 15 min, together' });
    expect(server.state.created).toEqual([{ templateId: STEADY_WEEK.id, invite: [LINH.id] }]);
  });

  it('starts a personal challenge without inviting anyone', async () => {
    renderApp(appRoutes, { initialUrl: '/together/challenges/new' });
    fireEvent.press(await screen.findByRole('button', { name: /^30 sessions in 30 days/ }));
    expect(screen.queryByText('Invite friends')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Start challenge' }));
    await until(() => server.state.created.length === 1);
    expect(server.state.created).toEqual([{ templateId: THIRTY_SESSIONS.id }]);
  });
});

describe('a challenge (shared progress from normal focus; no penalty)', () => {
  it('shows the window, the progress, and everyone taking part', async () => {
    server.state.detail = makeChallenge({ invited: [KAI] });
    await openDetail();
    expect(screen.getByText('12 Oct – 18 Oct')).toBeOnTheScreen();
    expect(progressText()).toBe('4 of 7 days');
    expect(screen.getByText('Mai Anh (you) · 4 of 7 days')).toBeOnTheScreen();
    expect(screen.getByText('Linh · 7 of 7 days · Reached')).toBeOnTheScreen();
    expect(screen.getByText('Kai · Invited')).toBeOnTheScreen();
  });

  it('shows a shared goal as the team total in hours', async () => {
    server.state.detail = makeChallenge({
      template: { ...TEAM_FIFTY } as typeof STEADY_WEEK,
      value: 754,
      participants: [
        { user: ME, value: 400, reached: false },
        // A shared goal is reached together, never by one person.
        { user: LINH, value: 354, reached: true },
      ],
    });
    renderApp(appRoutes, { initialUrl: `/together/challenges/${CHALLENGE_ID}` });
    await screen.findByRole('header', { name: '50 hours as a team in 7 days' });
    expect(progressText()).toBe('12 h 34 min of 50 h together');
    expect(screen.getByText('Mai Anh (you) · 6 h 40 min')).toBeOnTheScreen();
    expect(screen.getByText('Linh · 5 h 54 min')).toBeOnTheScreen();
  });

  it('says a finished challenge simply ended, never that it failed', async () => {
    server.state.detail = makeChallenge({ phase: 'ended' });
    await openDetail();
    expect(screen.getByText('Ended')).toBeOnTheScreen();
    expect(screen.queryByText(/fail|missed|lost/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Invite friends' })).toBeNull();
  });

  it('celebrates a completed challenge calmly', async () => {
    server.state.detail = makeChallenge({
      phase: 'completed',
      completedAt: '2026-10-16T18:00:00.000Z',
    });
    await openDetail();
    expect(screen.getByText('Completed together')).toBeOnTheScreen();
  });

  it('invites more friends, and explains a refusal', async () => {
    server.state.detail = makeChallenge({ participants: [{ user: ME, value: 4, reached: false }] });
    await openDetail();
    fireEvent.press(screen.getByRole('button', { name: 'Invite friends' }));
    await settleSheetTransitions();
    server.state.inviteAnswer = {
      status: 422,
      body: { ...nestError(422, 'Only friends can be invited.'), code: 'not_a_friend' },
    };
    fireEvent.press(await screen.findByRole('button', { name: 'Linh' }));
    fireEvent.press(screen.getByRole('button', { name: 'Send invitations' }));
    await shows('Only friends (people who follow you back) can be invited.');
    server.state.inviteAnswer = null;
    fireEvent.press(screen.getByRole('button', { name: 'Send invitations' }));
    await shows('Linh · Invited');
    expect(server.state.invited).toEqual([{ userIds: [LINH.id] }]);
  });

  it('never offers to invite someone already taking part', async () => {
    await openDetail();
    fireEvent.press(screen.getByRole('button', { name: 'Invite friends' }));
    await settleSheetTransitions();
    await shows('Friends are people you follow who follow you back.');
    expect(screen.queryByRole('button', { name: 'Linh' })).toBeNull();
  });

  it('leaves after confirming, without a trace or a penalty', async () => {
    const router = await openDetail();
    fireEvent.press(screen.getByRole('button', { name: 'Leave challenge' }));
    await settleSheetTransitions();
    fireEvent.press(screen.getByRole('button', { name: 'Leave' }));
    await until(() => router.getPathname() === '/together');
    expect(posts(`/me/challenges/${CHALLENGE_ID}/leave`)).toEqual([undefined]);
  });
});

describe('the completion line (docs/05 Session completion: one line of challenge progress)', () => {
  it('reads the first active challenge the user joined', () => {
    const lists = {
      current: [makeChallenge({ phase: 'upcoming', id: 'later' }), makeChallenge({ value: 5 })],
      invitations: [makeChallenge({ you: 'invited', id: 'invite' })],
      finished: [],
    };
    expect(completionChallengeLine(lists as never)).toBe(
      '7 days of 15 min, together · 5 of 7 days',
    );
  });

  it('is nothing without an active challenge', () => {
    expect(
      completionChallengeLine({
        current: [makeChallenge({ phase: 'upcoming' })],
        invitations: [],
        finished: [makeChallenge({ phase: 'ended' })],
      } as never),
    ).toBeNull();
  });
});
