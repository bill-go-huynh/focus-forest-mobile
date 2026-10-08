import { act, fireEvent, screen, within } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';

import { NetworkError } from '../api';
import type { Achievement, Badges } from '../api/progression';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makeLifetime } from '../test-utils/insights';
import { makePreferences } from '../test-utils/preferences';
import {
  FIRST_SESSION,
  HOURS_100,
  makeAchievement,
  makeBadge,
  makeBadges,
  STREAK_7,
} from '../test-utils/progression';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { until } from '../test-utils/sheets';

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

const HOURS_10 = makeBadge({
  id: 'focus-hours:10',
  name: '10 Hours',
  description: '10 hours of counted focus.',
  artworkId: 'focus-hours-10',
});
const STREAK_3 = makeBadge({
  id: 'focus-streak:3',
  name: '3-Day Streak',
  description: 'Focused 3 days in a row.',
  category: 'consistency',
  artworkId: 'focus-streak-3',
});

/**
 * A4.2 as these tests script it: the badges and achievements the server holds, and a showcase
 * PUT that answers the server's badges (or `showcaseAnswer`). Ownership, progress, and showcase
 * validity are the server's; the fake only stores what it is sent.
 */
function progressionApi() {
  const state = {
    offline: false,
    badges: makeBadges([FIRST_SESSION, STREAK_3, STREAK_7], [STREAK_7]) as Badges,
    achievements: [
      makeAchievement(FIRST_SESSION, {
        unit: 'sessions',
        current: 12,
        target: 1,
        completed: true,
        earnedAt: FIRST_SESSION.earnedAt,
        progressVisible: false,
      }),
      makeAchievement(HOURS_10, { current: 210, target: 600 }),
      makeAchievement(HOURS_100, { current: 210, target: 6000 }),
      makeAchievement(STREAK_7, {
        unit: 'days',
        current: 7,
        target: 7,
        completed: true,
        earnedAt: STREAK_7.earnedAt,
      }),
    ] as Achievement[],
    showcaseAnswer: null as Reply | null,
  };
  const handler = ({ url, method, body }: FakeRequest): Reply => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (state.offline) return new NetworkError();
    if (pathname === '/me/profile')
      return {
        status: 200,
        body: {
          id: 'user-1',
          displayName: 'Mai Anh',
          avatarUrl: null,
          bio: null,
          joinDate: '2026-09-26T10:00:00.000Z',
          timezone: 'Europe/Zurich',
        },
      };
    if (pathname === '/me/profile/stats') return { status: 200, body: makeLifetime() };
    if (pathname === '/me/badges') return { status: 200, body: state.badges };
    if (pathname === '/me/achievements')
      return { status: 200, body: { items: state.achievements } };
    if (pathname === '/me/badges/showcase' && method === 'PUT') {
      if (state.showcaseAnswer) {
        const answer = state.showcaseAnswer;
        state.showcaseAnswer = null;
        return answer;
      }
      const ids = (body as { badgeIds: string[] }).badgeIds;
      state.badges = {
        ...state.badges,
        showcase: ids.map((id) => state.badges.items.find((b) => b.id === id)!),
      };
      return { status: 200, body: state.badges };
    }
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
  return { handler, state };
}

let server: ReturnType<typeof progressionApi>;
let requests: FakeRequest[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  server = progressionApi();
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
const pause = (ms = 300) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const showcasePuts = () =>
  requests
    .filter((r) => r.method === 'PUT' && r.url === `${API}/me/badges/showcase`)
    .map((r) => r.body);
const showcaseRow = () => within(screen.getByTestId('showcase'));

async function openAchievements() {
  renderApp(appRoutes, { initialUrl: '/profile/achievements' });
  await screen.findByRole('header', { name: 'Showcase' });
  await screen.findByRole('header', { name: 'Focus' });
}

describe('Profile: the showcase and the way to Achievements (docs/05 §3)', () => {
  it('shows the pinned badges in the user’s order, and opens Achievements', async () => {
    server.state.badges = makeBadges([FIRST_SESSION, STREAK_7], [STREAK_7, FIRST_SESSION]);
    renderApp(appRoutes, { initialUrl: '/profile' });
    await screen.findByRole('header', { name: 'Profile' });
    await until(() => screen.queryByTestId('profile-showcase') !== null);
    expect(
      within(screen.getByTestId('profile-showcase'))
        .getAllByRole('text')
        .map((node) => node.props.children),
    ).toEqual(['7-Day Streak', 'First Session']);
    fireEvent.press(screen.getByRole('button', { name: 'Achievements' }));
    await screen.findByRole('header', { name: 'Showcase' });
  });

  it('introduces badges only once the user has one (docs/02: layers come when relevant)', async () => {
    server.state.badges = makeBadges();
    renderApp(appRoutes, { initialUrl: '/profile' });
    await screen.findByRole('button', { name: 'Goals and rest days' });
    await pause();
    expect(screen.queryByRole('button', { name: 'Achievements' })).toBeNull();
    expect(screen.queryByTestId('profile-showcase')).toBeNull();
  });

  it('keeps Profile whole when the badges cannot be read', async () => {
    server.state.offline = true;
    renderApp(appRoutes, { initialUrl: '/profile' });
    await screen.findByRole('header', { name: 'Profile' });
    await pause();
    expect(screen.queryByTestId('profile-showcase')).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeOnTheScreen();
  });
});

describe('Achievements and badge showcase (docs/05 §3)', () => {
  it('leads with the showcase, then earned badges by category, then quiet progress', async () => {
    await openAchievements();
    expect(showcaseRow().getByText('7-Day Streak')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Focus' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Consistency' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'In progress' })).toBeOnTheScreen();
    expect(screen.getByRole('progressbar', { name: '10 Hours' })).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ text: '3.5 / 10 h' }),
    );
    expect(screen.getByRole('progressbar', { name: '100 Hours' })).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ text: '3.5 / 100 h' }),
    );
    // Earned achievements are badges, not progress; hidden progress shows no numbers.
    expect(screen.queryByRole('progressbar', { name: '7-Day Streak' })).toBeNull();
    expect(screen.queryByText(/12 \/ 1/)).toBeNull();
  });

  it('never shows a percentage of everything, or urgency', async () => {
    await openAchievements();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/hurry|don.t miss|only \d+ left|last chance/i)).toBeNull();
  });

  it('pins a badge at the end of the showcase and shows the server’s answer', async () => {
    await openAchievements();
    fireEvent.press(screen.getByRole('button', { name: 'Pin First Session to your showcase' }));
    await until(() => showcaseRow().queryByText('First Session') !== null);
    expect(showcasePuts()).toEqual([{ badgeIds: ['focus-streak:7', 'first-session'] }]);
  });

  it('unpins and reorders, always sending the whole list in order', async () => {
    server.state.badges = makeBadges(
      [FIRST_SESSION, STREAK_3, STREAK_7],
      [STREAK_7, FIRST_SESSION, STREAK_3],
    );
    await openAchievements();
    fireEvent.press(screen.getByRole('button', { name: 'Move First Session earlier' }));
    await until(() => showcasePuts().length === 1);
    expect(showcasePuts()[0]).toEqual({
      badgeIds: ['first-session', 'focus-streak:7', 'focus-streak:3'],
    });
    await pause();
    fireEvent.press(screen.getByRole('button', { name: 'Unpin 7-Day Streak' }));
    await until(() => showcasePuts().length === 2);
    expect(showcasePuts()[1]).toEqual({ badgeIds: ['first-session', 'focus-streak:3'] });
  });

  it('offers no fourth pin', async () => {
    server.state.badges = makeBadges(
      [FIRST_SESSION, STREAK_3, STREAK_7, HOURS_10],
      [STREAK_7, FIRST_SESSION, STREAK_3],
    );
    // Owning 10 Hours means its achievement is completed (A4.2: completed exactly when owned).
    server.state.achievements = server.state.achievements.map((achievement) =>
      achievement.id === HOURS_10.id
        ? { ...achievement, current: 600, completed: true, earnedAt: HOURS_10.earnedAt }
        : achievement,
    );
    await openAchievements();
    const pin = screen.getByRole('button', { name: 'Pin 10 Hours to your showcase' });
    expect(pin).toBeDisabled();
    fireEvent.press(pin);
    await pause();
    expect(showcasePuts()).toEqual([]);
    expect(
      screen.getByText('Your showcase holds 3 badges. Unpin one to pin another.'),
    ).toBeOnTheScreen();
  });

  it('changes nothing offline and says so calmly', async () => {
    await openAchievements();
    server.state.offline = true;
    fireEvent.press(screen.getByRole('button', { name: 'Pin First Session to your showcase' }));
    await shows('Changing your showcase needs a connection. Nothing was changed.');
    expect(showcaseRow().queryByText('First Session')).toBeNull();
  });

  it('reads the badges again when the server refuses a pin', async () => {
    server.state.showcaseAnswer = {
      status: 422,
      body: { ...nestError(422, 'No.'), code: 'badge_not_owned' },
    };
    await openAchievements();
    const before = requests.filter((r) => r.url === `${API}/me/badges`).length;
    fireEvent.press(screen.getByRole('button', { name: 'Pin First Session to your showcase' }));
    await shows("That badge can't be pinned right now.");
    await until(() => requests.filter((r) => r.url === `${API}/me/badges`).length > before);
    expect(screen.queryByText(/badge_not_owned|No\./)).toBeNull();
  });

  it('shows a calm retry when the achievements cannot load', async () => {
    server.state.offline = true;
    renderApp(appRoutes, { initialUrl: '/profile/achievements' });
    await shows("We couldn't load your achievements right now.");
    server.state.offline = false;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await shows('10 Hours');
  });

  it('never celebrates from reading the badges', async () => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockClear();
    await openAchievements();
    await pause();
    expect(screen.queryByText(/New badge/)).toBeNull();
    expect(
      jest.mocked(AccessibilityInfo.announceForAccessibility).mock.calls.map(([m]) => m),
    ).not.toContainEqual(expect.stringMatching(/New badge/));
  });
});
