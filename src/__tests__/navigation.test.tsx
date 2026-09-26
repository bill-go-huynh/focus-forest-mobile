import { act, fireEvent, screen, within } from 'expo-router/testing-library';
import { router as expoRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { fakeFetch } from '../test-utils/api';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { darkTheme, lightTheme } from '../theme';

const mockColorScheme = jest.fn<'light' | 'dark' | null, []>(() => 'light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

// The tabs are for signed-in users (M11): start each test with a saved session.
jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);

// The native app config is not available in jest; this is app.json's version.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

const tab = (name: string) => screen.getByRole('tab', { name });
const tabNames = () =>
  within(screen.getByTestId('tab-bar'))
    .getAllByRole('tab')
    .map((node) => node.props.accessibilityLabel as string);

async function openApp(initialUrl = '/') {
  const router = renderApp(appRoutes, { initialUrl });
  expect((await screen.findByTestId('tab-bar')).props.accessibilityRole).toBe('tablist');
  return router;
}

// Profile reads GET /me/profile (M12).
const originalFetch = globalThis.fetch;
beforeEach(() => {
  mockColorScheme.mockReturnValue('light');
  signInForTest();
  process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';
  globalThis.fetch = fakeFetch(() => ({
    status: 200,
    body: {
      id: 'user-1',
      displayName: 'Mai Anh',
      avatarUrl: null,
      bio: null,
      joinDate: '2026-09-26T10:00:00.000Z',
      timezone: 'Europe/Zurich',
    },
  })).fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('four-tab navigation (docs/05 §1)', () => {
  it('has exactly four tabs, in order: Home, Forest, Insights, Profile', async () => {
    await openApp();
    expect(tabNames()).toEqual(['Home', 'Forest', 'Insights', 'Profile']);
  });

  it('has no Focus tab: Focus is an action on Home, not a destination', async () => {
    await openApp();
    expect(screen.queryByRole('tab', { name: /focus/i })).toBeNull();
  });

  it('has no Settings tab: Settings live under Profile only', async () => {
    await openApp();
    expect(screen.queryByRole('tab', { name: /settings/i })).toBeNull();
  });

  it('opens on Home, and screen readers hear Home as the selected tab', async () => {
    const router = await openApp();
    expect(router.getPathname()).toBe('/');
    expect(tab('Home')).toBeSelected();
    for (const name of ['Forest', 'Insights', 'Profile']) {
      expect(tab(name)).not.toBeSelected();
    }
  });

  it.each([
    ['Forest', '/forest', "Your forest begins when this month's tree is planted."],
    ['Insights', '/insights', 'Your focus story begins with your first session.'],
    ['Profile', '/profile', 'Mai Anh'],
  ])('switches to %s and marks it as the selected tab', async (name, path, message) => {
    const router = await openApp();
    fireEvent.press(tab(name));

    expect(router.getPathname()).toBe(path);
    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(tab(name)).toBeSelected();
    expect(tab('Home')).not.toBeSelected();
  });

  describe('designed empty states, never "coming soon" (docs/05 §4, docs/01 §9)', () => {
    it.each(['/', '/forest', '/insights', '/profile', '/profile/settings'])(
      '%s shows real content, not a placeholder promise',
      async (path) => {
        await openApp(path);
        expect(
          screen.queryByText(/coming soon|soon|not available yet|under construction/i),
        ).toBeNull();
      },
    );

    it('Home shows the seed shell in the tree scene, with no tree yet', async () => {
      await openApp('/');
      expect(
        await screen.findByText("Your first session will plant this month's seed."),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId('illustration-seed-in-soil', { includeHiddenElements: true }),
      ).toBeOnTheScreen();
      const hero = screen.getByTestId('home-hero');
      expect(StyleSheet.flatten(hero.props.style).backgroundColor).toBe(
        lightTheme.colors.surface.scene,
      );
    });

    it("Forest leads back to this month's tree on Home", async () => {
      const router = await openApp('/forest');
      fireEvent.press(await screen.findByRole('button', { name: "See this month's tree" }));
      expect(router.getPathname()).toBe('/');
      expect(tab('Home')).toBeSelected();
    });

    it('Insights leads to the tree on Home, where focus starts', async () => {
      const router = await openApp('/insights');
      fireEvent.press(await screen.findByRole('button', { name: 'Go to your tree' }));
      expect(router.getPathname()).toBe('/');
    });
  });

  describe('Settings, reached from Profile', () => {
    it('opens Settings from Profile, one level deep, with Profile still selected', async () => {
      const router = await openApp('/profile');
      fireEvent.press(await screen.findByRole('button', { name: 'Settings' }));

      expect(router.getPathname()).toBe('/profile/settings');
      expect(await screen.findByRole('header', { name: 'Settings' })).toBeOnTheScreen();
      expect(tab('Profile')).toBeSelected();
    });

    it('goes back to Profile', async () => {
      const router = await openApp('/profile');
      fireEvent.press(await screen.findByRole('button', { name: 'Settings' }));
      act(() => expoRouter.back());
      expect(router.getPathname()).toBe('/profile');
    });

    it('shows the app version as real content', async () => {
      await openApp('/profile/settings');
      expect(await screen.findByLabelText('Version, 0.1.0')).toBeOnTheScreen();
    });
  });

  describe('screens', () => {
    it.each([
      ['/', 'This month'],
      ['/forest', 'Forest'],
      ['/insights', 'Insights'],
      ['/profile', 'Profile'],
    ])('%s has a heading for screen readers', async (path, heading) => {
      await openApp(path);
      expect(await screen.findByRole('header', { name: heading })).toBeOnTheScreen();
    });

    it.each([
      ['light', lightTheme],
      ['dark', darkTheme],
    ] as const)('use the background token in the %s theme', async (scheme, theme) => {
      mockColorScheme.mockReturnValue(scheme);
      await openApp('/forest');
      const container = await screen.findByTestId('screen');
      expect(StyleSheet.flatten(container.props.style).backgroundColor).toBe(
        theme.colors.background.primary,
      );
    });

    it('scroll, so content stays reachable at 200% text', async () => {
      await openApp('/forest');
      expect(await screen.findByTestId('screen-scroll')).toBeOnTheScreen();
    });
  });
});
