import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Circle, Text as SvgText } from 'react-native-svg';

import { renderWithProviders } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { Avatar } from '../Avatar';

const mockColorScheme = jest.fn<'light' | 'dark', []>(() => 'light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

const themes = [
  ['light', lightTheme],
  ['dark', darkTheme],
] as const satisfies readonly (readonly ['light' | 'dark', Theme])[];

const byType = (type: unknown) => screen.UNSAFE_root.findAll((node) => node.type === type);

beforeEach(() => mockColorScheme.mockReturnValue('light'));

describe('Avatar (initials until avatar upload exists, docs/08 §5)', () => {
  it('shows the initials', () => {
    renderWithProviders(<Avatar initials="MA" />);
    expect(byType(SvgText)[0]?.props.children).toBe('MA');
  });

  it('is decorative: the name beside it is what screen readers read', () => {
    renderWithProviders(<Avatar initials="MA" />);
    expect(screen.queryByTestId('avatar')).toBeNull();
    expect(screen.getByTestId('avatar', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('is a circle at the avatar size token', () => {
    renderWithProviders(<Avatar initials="MA" />);
    const avatar = screen.getByTestId('avatar', { includeHiddenElements: true });
    expect(StyleSheet.flatten(avatar.props.style)).toMatchObject({
      width: lightTheme.avatar.lg,
      height: lightTheme.avatar.lg,
    });
  });

  it.each(themes)('uses the accent tokens in the %s theme', (scheme, theme) => {
    mockColorScheme.mockReturnValue(scheme);
    renderWithProviders(<Avatar initials="MA" />);
    expect(byType(Circle)[0]?.props.fill).toBe(theme.colors.accent.soft);
    expect(byType(SvgText)[0]?.props.fill).toBe(theme.colors.text.accent);
  });

  it('shows a seed mark instead of letters when there is no name yet', () => {
    renderWithProviders(<Avatar initials={null} />);
    expect(byType(SvgText)).toHaveLength(0);
    expect(screen.getByTestId('avatar-seed', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});
