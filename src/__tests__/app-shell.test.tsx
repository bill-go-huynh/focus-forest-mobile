import { screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { useReducedMotion } from '../accessibility';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';

const mockColorScheme = jest.fn<'light' | 'dark' | null, []>();
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

// The tabs are for signed-in users (M11): start each test with a saved session.
jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);

beforeEach(() => signInForTest());

describe('app shell', () => {
  it('opens on the Home tab inside the root layout', async () => {
    mockColorScheme.mockReturnValue('light');
    const router = renderApp(appRoutes);

    expect(await screen.findByRole('header', { name: 'This month' })).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/');
  });

  it('provides the accessibility foundation to every screen', async () => {
    mockColorScheme.mockReturnValue('light');
    function MotionAwareScreen() {
      return <Text>{useReducedMotion() ? 'reduced' : 'full'} motion</Text>;
    }
    renderApp({ ...appRoutes, '(tabs)/index': MotionAwareScreen });
    expect(await screen.findByText('full motion')).toBeOnTheScreen();
  });
});
