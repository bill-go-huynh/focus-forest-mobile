import { render, renderHook, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { darkTheme, lightTheme } from '../theme';
import { ThemeProvider, useTheme } from '../ThemeProvider';

const mockColorScheme = jest.fn<'light' | 'dark' | null | undefined, []>();
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

function Probe() {
  const theme = useTheme();
  return <Text testID="scheme">{theme.scheme}</Text>;
}

describe('ThemeProvider', () => {
  it.each([
    ['light', 'light', 'light'],
    ['light', 'dark', 'dark'],
    ['dark', 'light', 'light'],
    ['dark', 'dark', 'dark'],
    ['dark', 'system', 'dark'],
    ['light', 'system', 'light'],
  ] as const)(
    'with the system %s and the app preference %s, uses %s (A5 theme)',
    (system, preference, expected) => {
      mockColorScheme.mockReturnValue(system);
      render(
        <ThemeProvider preference={preference}>
          <Probe />
        </ThemeProvider>,
      );
      expect(screen.getByTestId('scheme')).toHaveTextContent(expected);
    },
  );

  it('switches at once when the app preference changes', () => {
    mockColorScheme.mockReturnValue('light');
    const { rerender } = render(
      <ThemeProvider preference="system">
        <Probe />
      </ThemeProvider>,
    );
    rerender(
      <ThemeProvider preference="dark">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  });

  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    [null, 'light'],
    [undefined, 'light'],
  ] as const)('follows the system setting (%s → %s) by default', (system, expected) => {
    mockColorScheme.mockReturnValue(system);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('scheme')).toHaveTextContent(expected);
  });

  it('switches when the system setting changes', () => {
    mockColorScheme.mockReturnValue('light');
    const { rerender } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    mockColorScheme.mockReturnValue('dark');
    rerender(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark');
  });

  it('provides the full theme object for the active scheme', () => {
    mockColorScheme.mockReturnValue('dark');
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current).toBe(darkTheme);
    expect(result.current).not.toBe(lightTheme);
  });

  it('fails clearly when used outside the provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
  });
});
