import { screen, within } from 'expo-router/testing-library';

import { currentTreeSchema, type HomeResponse } from '../api';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makeCurrentTree, makeHome } from '../test-utils/core-loop';
import { forestMonths, forestPage } from '../test-utils/forest';
import { makeLifetime } from '../test-utils/insights';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { until } from '../test-utils/sheets';
import contract from '../test-utils/x4/progression-contract.json';

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

const API = 'https://api.example.com';
const hidden = { includeHiddenElements: true } as const;

/**
 * X4: the app's Progression screens driven by the API's real answers (the captured contract,
 * after the 100-hour session): Achievements, the Collection Book and an item, the locked species
 * choice, the garden on Home, and the profile frame. Only Core answers outside the capture are
 * scripted.
 */
function contractApi(): (request: FakeRequest) => { status: number; body?: unknown } {
  const tree = contract.speciesSelected.tree;
  const answers: Record<string, unknown> = {
    '/me/achievements': contract.achievements,
    '/me/badges': contract.badgesAfter,
    '/me/species': contract.speciesLocked,
    '/me/cosmetics': contract.cosmetics,
    '/me/equipment': contract.equipped,
    '/me/collection': contract.collectionAfter,
    '/me/preferences': makePreferences(),
    '/session-rules': { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 },
    '/me/topics': [],
    '/me/home': {
      ...makeHome(),
      tree: currentTreeSchema.parse(contract.speciesSelected).tree,
    } satisfies HomeResponse,
    '/me/trees/current': { ...makeCurrentTree(), tree },
    '/me/forest': forestPage(forestMonths(1)),
    '/me/profile/stats': makeLifetime(),
    '/me/profile': {
      id: 'user-1',
      username: null,
      displayName: 'Mai Anh',
      avatarUrl: null,
      bio: null,
      joinDate: '2026-07-01T00:00:00.000Z',
      timezone: 'UTC',
    },
  };
  return ({ url, method }) => {
    const { pathname } = new URL(url);
    if (method === 'GET' && pathname in answers) return { status: 200, body: answers[pathname] };
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  globalThis.fetch = fakeFetch(contractApi()).fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);

describe('X4: Progression screens from the API’s real answers', () => {
  it('Achievements: the pinned showcase in order, and progress still to go', async () => {
    renderApp(appRoutes, { initialUrl: '/profile/achievements' });
    await shows('Showcase');
    // The server's order, as pinned: 50 Hours first.
    const pinned = within(screen.getByTestId('showcase'))
      .getAllByText(/^(50 Hours|First Session)$/)
      .map((node) => node.props.children);
    expect(pinned).toEqual(['50 Hours', 'First Session']);
    expect(screen.getByRole('button', { name: 'Unpin 50 Hours' })).toBeOnTheScreen();
    expect(screen.getByText('98 / 100 h')).toBeOnTheScreen();
  });

  it('Collection Book: counts, owned art, locked silhouettes with honest hints', async () => {
    renderApp(appRoutes, { initialUrl: '/collection' });
    // Trees: 6 of 9. Badges: 6 of 14, with the two Focus Together badges A5.4 made earnable and
    // the three time-based ones (owner decision 2026-10-15); Community Contributor went with the
    // Community Tree (2026-10-22).
    await until(() => screen.queryAllByText('6 of 9 in your collection').length === 1);
    expect(screen.getByText('6 of 14 in your collection')).toBeOnTheScreen();
    expect(screen.getByText('4 of 5 in your collection')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Golden Sakura, not yet in your collection' }),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('collection-silhouette-twig-frame', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('cosmetic-mark-misty-hills', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('badge-mark-focus-hours-100', hidden)).toBeOnTheScreen();
  });

  it('an item: a locked tree’s hint, and the garden piece in use', async () => {
    renderApp(appRoutes, { initialUrl: '/collection/species/golden-sakura' });
    await screen.findByRole('header', { name: 'Golden Sakura' });
    expect(screen.getByText(/^Comes with the 500 Hours badge: /)).toBeOnTheScreen();
    expect(screen.getByText('100.1 / 500 h')).toBeOnTheScreen();
    screen.unmount();

    renderApp(appRoutes, { initialUrl: '/collection/cosmetic/stone-lantern' });
    await screen.findByRole('header', { name: 'Stone Lantern' });
    await shows('In your garden');
    expect(screen.getByRole('button', { name: 'Stop using' })).toBeOnTheScreen();
    screen.unmount();

    renderApp(appRoutes, { initialUrl: '/collection/species/sakura' });
    await screen.findByRole('header', { name: 'Sakura' });
    expect(screen.getByText('Growing this month')).toBeOnTheScreen();
  });

  it('species choice: locked for the month, named, nothing to choose', async () => {
    renderApp(appRoutes, { initialUrl: '/species' });
    await shows("This month's tree is growing as a Sakura. You can choose again next month.");
    expect(screen.queryByRole('button', { name: /^Choose / })).toBeNull();
  });

  it('Home: the Sakura tree in the equipped garden', async () => {
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: /Start Focus/ });
    await until(() => screen.queryByTestId('scene-decoration-stone-lantern', hidden) !== null);
    expect(screen.getByRole('image', { name: /Sakura/ })).toBeOnTheScreen();
  });
});
