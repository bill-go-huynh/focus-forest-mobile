import { fireEvent, screen } from 'expo-router/testing-library';

import type { HomeResponse } from '../api';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makeCollection } from '../test-utils/collection';
import { makeCurrentTree, makeHome } from '../test-utils/core-loop';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { until } from '../test-utils/sheets';
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

const AUTUMN = {
  id: 'autumn-north',
  name: 'Autumn',
  description: 'Warm leaves and long light.',
  environmentId: 'autumn',
  startsAt: '2026-09-22T00:00:00.000Z',
  endsAt: '2026-12-21T00:00:00.000Z',
};

function makeSeason(
  overrides: { theme?: typeof AUTUMN | null; hemisphere?: string; source?: string } = {},
) {
  const theme = overrides.theme === undefined ? AUTUMN : overrides.theme;
  return {
    hemisphere: overrides.hemisphere ?? 'north',
    hemisphereSource: overrides.source ?? 'time_zone',
    theme,
    rewards: theme
      ? [
          {
            id: 'leaves',
            kind: 'cosmetic',
            item: {
              id: 'falling-leaves',
              name: 'Falling Leaves',
              description: 'Leaves drifting through the autumn forest.',
              type: 'decoration',
              rarity: 'common',
              artworkId: 'falling-leaves',
            },
            requiredActiveDays: 1,
            activeDays: 1,
            owned: true,
          },
          {
            id: 'steady',
            kind: 'badge',
            item: {
              id: 'autumn-steady',
              name: 'Autumn Steady',
              description: 'Focused on three autumn days.',
              category: 'event',
              rarity: 'rare',
              artworkId: 'autumn-steady',
            },
            requiredActiveDays: 3,
            activeDays: 1,
            owned: false,
          },
        ]
      : [],
  };
}

/**
 * M5.6 Seasonal (docs/03 §10: themes change environment and atmosphere, never the earned tree;
 * hemisphere-aware; docs/11: overlays respect reduced motion and text contrast; spec §17.3:
 * limited items earned stay owned).
 */
function seasonsApi() {
  const state = {
    season: makeSeason(),
    reducedMotion: false,
    hemispheres: [] as unknown[],
  };
  const handler = ({ url, method, body }: FakeRequest): Reply => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences')
      return { status: 200, body: makePreferences({ reducedMotion: state.reducedMotion }) };
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics') return { status: 200, body: [] };
    if (pathname === '/me/home') {
      const home: HomeResponse = { ...makeHome(), tree: treeDto({ stage: 'young_tree' }) };
      return { status: 200, body: home };
    }
    if (pathname === '/me/trees/current') return { status: 200, body: makeCurrentTree() };
    if (pathname === '/me/collection') return { status: 200, body: makeCollection() };
    if (pathname === '/me/season') return { status: 200, body: state.season };
    if (pathname === '/me/season/hemisphere' && method === 'PUT') {
      state.hemispheres.push(body);
      const chosen = (body as { hemisphere: string | null }).hemisphere;
      state.season = makeSeason({
        hemisphere: chosen ?? 'north',
        source: chosen ? 'set' : 'time_zone',
      });
      return { status: 200, body: state.season };
    }
    return { status: 500, body: nestError(500, `Not in this test: ${method} ${pathname}`) };
  };
  return { handler, state };
}

let server: ReturnType<typeof seasonsApi>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  server = seasonsApi();
  globalThis.fetch = fakeFetch(server.handler).fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
const treeLabel = () =>
  (
    screen
      .queryByTestId('home-hero')
      ?.findAll((node) => node.props.accessibilityRole === 'image')[0]?.props as
      { accessibilityLabel?: string } | undefined
  )?.accessibilityLabel;

describe('seasonal overlays on Home (environment and atmosphere only)', () => {
  it("drifts the season's atmosphere around the tree, hidden from screen readers", async () => {
    renderApp(appRoutes, { initialUrl: '/' });
    const overlay = await screen.findByTestId('seasonal-overlay', { includeHiddenElements: true });
    expect(overlay.props.accessibilityElementsHidden).toBe(true);
    expect(overlay.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(overlay.props.pointerEvents).toBe('none');
    expect(overlay.props.accessibilityHint ?? null).toBeNull();
    expect(
      screen.getByTestId('seasonal-overlay-autumn-drift', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  it('stays still under reduced motion', async () => {
    server.state.reducedMotion = true;
    renderApp(appRoutes, { initialUrl: '/' });
    expect(
      await screen.findByTestId('seasonal-overlay-autumn-still', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });

  it('never changes the earned tree: its description is the same in or out of season', async () => {
    const first = renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByTestId('seasonal-overlay', { includeHiddenElements: true });
    await until(() => treeLabel() !== undefined);
    const inSeason = treeLabel();
    first.unmount();
    server.state.season = makeSeason({ theme: null });
    renderApp(appRoutes, { initialUrl: '/' });
    await until(() => treeLabel() !== undefined);
    expect(treeLabel()).toBe(inSeason);
    expect(screen.queryByTestId('seasonal-overlay', { includeHiddenElements: true })).toBeNull();
  });
});

describe('the hemisphere (docs/03 §10: "October = autumn" is not universal)', () => {
  it('shows where it comes from, and lets the user choose', async () => {
    renderApp(appRoutes, { initialUrl: '/profile/settings' });
    await shows('Northern hemisphere, from your time zone');
    fireEvent.press(screen.getByRole('button', { name: 'Southern' }));
    await shows('Southern hemisphere, chosen by you');
    fireEvent.press(screen.getByRole('button', { name: 'Automatic' }));
    await shows('Northern hemisphere, from your time zone');
    expect(server.state.hemispheres).toEqual([{ hemisphere: 'south' }, { hemisphere: null }]);
  });
});

describe("the season's limited collection (owned forever once earned)", () => {
  it('lists its rewards in the Collection Book with honest progress', async () => {
    renderApp(appRoutes, { initialUrl: '/collection' });
    await screen.findByRole('header', { name: 'This season: Autumn' });
    expect(screen.getByText('Falling Leaves · In your collection')).toBeOnTheScreen();
    expect(screen.getByText('Autumn Steady · 1 of 3 days with focus')).toBeOnTheScreen();
    // Information, never pressure (docs/02).
    expect(screen.queryByText(/hurry|ends soon|last chance|only \d+ days/i)).toBeNull();
  });

  it('shows no seasonal section outside a season', async () => {
    server.state.season = makeSeason({ theme: null });
    renderApp(appRoutes, { initialUrl: '/collection' });
    await screen.findByRole('header', { name: 'Collection Book' });
    await until(() => screen.queryByText(/This season/) === null);
    expect(screen.queryByRole('header', { name: /This season/ })).toBeNull();
  });
});
