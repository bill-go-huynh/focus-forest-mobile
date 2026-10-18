import { act, screen } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';

import x3 from '../test-utils/x3/core-loop-contract.json';
import x4 from '../test-utils/x4/progression-contract.json';
import x5 from '../test-utils/x5/community-contract.json';
import x6 from '../test-utils/x6/notifications-contract.json';
import { accessibilityProblems } from '../test-utils/a11y-audit';
import { avoidedWordProblems, renderedCopy } from '../test-utils/avoided-words';
import { fakeFetch, type FakeRequest } from '../test-utils/api';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';

/**
 * M7.3 Accessibility verification (docs/11; docs/12 Phase 20: the accessibility checklist passes
 * for every screen). Every route is rendered on answers captured from the real API (the X3–X6
 * contracts) and audited: every control has a role and a name, every text field a label, and the
 * screen a heading. A route the fake server cannot answer shows its calm error state, audited too.
 * Final review FR.8: everything each screen shows is also checked against the docs/02 "Words we
 * use / avoid" table.
 */

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

const API = 'https://api.example.com';
const id = (value: unknown) => (value as { id: string }).id;
const FRIEND = id(x5.friendProfile.user);
const ROOM = id(x5.roomJoined);
const CHALLENGE = id(x5.challengeCreated);
const EVENT = id(x5.event);
const SESSION = id(x3.sessionFirst);

/** Answers by path, from the contracts; anything else is a 404 the screen shows calmly. */
const ANSWERS: [RegExp, unknown][] = [
  [/^\/me\/preferences$/, makePreferences({ reducedMotion: true })],
  [/^\/me\/home$/, x5.home],
  [/^\/me\/trees\/current$/, x3.currentTree],
  [/^\/me\/goals$/, x3.goals],
  [/^\/me\/rest-days$/, x3.restDays],
  [/^\/me\/streak$/, x3.streak],
  [/^\/me\/forest$/, x3.forest],
  [/^\/me\/trees\/\d+\/\d+$/, x3.treeArchived],
  [/^\/me\/trees\/\d+\/\d+\/recap$/, x3.recap],
  [/^\/me\/insights\/week$/, x3.insightsWeek],
  [/^\/me\/insights\/month$/, x3.insightsMonth],
  [/^\/me\/insights\/heatmap$/, x3.heatmap],
  [/^\/me\/insights\/records$/, x3.records],
  [/^\/me\/profile\/stats$/, x3.profileStats],
  [/^\/me\/sessions$/, x3.historySeptember],
  [/^\/me\/sessions\/[^/]+$/, x3.sessionFirst],
  [/^\/me\/profile$/, x3.profile],
  [/^\/me\/topics$/, x3.topics],
  [/^\/me\/achievements$/, x4.achievements],
  [/^\/me\/badges$/, x4.badgesAfter],
  [/^\/me\/species$/, x4.speciesOpen],
  [/^\/me\/cosmetics$/, x4.cosmetics],
  [/^\/me\/equipment$/, x4.equipmentEmpty],
  [/^\/me\/collection$/, x4.collectionAfter],
  [/^\/users\/search$/, x5.search],
  [/^\/me\/following$/, x5.followers],
  [/^\/me\/followers$/, x5.followers],
  [/^\/users\/[^/]+\/profile$/, x5.friendProfile],
  [/^\/users\/[^/]+\/forest$/, x5.friendForest],
  [/^\/users\/[^/]+\/reactions$/, x5.reacted],
  [/^\/me\/reactions$/, x5.received],
  [/^\/me\/privacy$/, x5.privacy],
  [/^\/me\/warnings$/, x5.warnings],
  [/^\/me\/blocks$/, x5.blocks],
  [/^\/me\/challenges$/, x5.challenges],
  [/^\/me\/challenges\/[^/]+$/, x5.challengeAccepted],
  [/^\/rooms$/, x5.lobbies],
  [/^\/rooms\/current$/, { room: x5.roomJoined }],
  [/^\/rooms\/[^/]+$/, x5.roomJoined],
  [/^\/events$/, x5.events],
  [/^\/events\/[^/]+$/, x5.event],
  [/^\/events\/[^/]+\/community-tree$/, x5.community],
  [/^\/me\/season$/, x5.season],
  [/^\/leaderboards$/, x5.boardFriends],
  [/^\/me\/room-invites$/, x6.roomInvites],
  [/^\/session-rules$/, { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 }],
];

function api({ url, method }: FakeRequest) {
  const { pathname } = new URL(url);
  if (method === 'GET') {
    const found = ANSWERS.find(([pattern]) => pattern.test(pathname));
    if (found) return { status: 200, body: found[1] };
  }
  return { status: 404, body: { statusCode: 404, message: 'Not Found', error: 'Not Found' } };
}

const ROUTES = [
  '/',
  '/forest',
  '/insights',
  '/together',
  '/together/search',
  `/together/${FRIEND}`,
  `/together/${FRIEND}/forest`,
  `/together/room/${ROOM}`,
  '/together/challenges/new',
  `/together/challenges/${CHALLENGE}`,
  `/together/events/${EVENT}`,
  `/together/community/${EVENT}`,
  '/together/leaderboards',
  '/profile',
  '/profile/edit',
  '/profile/achievements',
  '/profile/goals',
  '/profile/topics',
  '/profile/settings',
  '/profile/privacy',
  '/profile/blocked',
  '/profile/delete-account',
  `/completion/${SESSION}`,
  '/species',
  '/tree',
  '/month/2026/9',
  '/recap/2026/9',
  '/ceremony/2026/9',
  '/collection',
  '/onboarding',
];

const originalFetch = globalThis.fetch;
beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  globalThis.fetch = fakeFetch(api).fetch;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

/** Lets the screen read its answers and settle. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 400)));

describe('accessibility of every screen (M7.3)', () => {
  it.each(ROUTES)('%s', async (route) => {
    renderApp(appRoutes, { initialUrl: route });
    await settle();
    await settle();
    expect(accessibilityProblems(screen.toJSON())).toEqual([]);
    expect(renderedCopy(screen.toJSON()).flatMap(avoidedWordProblems)).toEqual([]);
  });

  it.each(['/welcome', '/sign-in', '/sign-up'])('%s (signed out)', async (route) => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      deleteItemAsync: (key: string) => Promise<void>;
    };
    await secureStore.deleteItemAsync('focus-forest.session');
    renderApp(appRoutes, { initialUrl: route });
    await settle();
    expect(accessibilityProblems(screen.toJSON())).toEqual([]);
    expect(renderedCopy(screen.toJSON()).flatMap(avoidedWordProblems)).toEqual([]);
  });
});
