import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { MIN_TOUCH_TARGET } from '../../accessibility';
import { renderWithProviders, TEST_SAFE_AREA_INSETS } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { TabBar, type TabBarProps } from '../TabBar';

const mockColorScheme = jest.fn<'light' | 'dark', []>(() => 'light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

const themes = [
  ['light', lightTheme],
  ['dark', darkTheme],
] as const satisfies readonly (readonly ['light' | 'dark', Theme])[];

const styleOf = (element: ReactTestInstance) => StyleSheet.flatten(element.props.style);

const ROUTES = [
  { key: 'index-1', name: 'index', title: 'Home' },
  { key: 'forest-1', name: 'forest', title: 'Forest' },
  { key: 'insights-1', name: 'insights', title: 'Insights' },
  { key: 'profile-1', name: 'profile', title: 'Profile' },
];

function makeProps(focusedIndex = 0, { prevented = false } = {}) {
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: prevented })),
    navigate: jest.fn(),
  };
  const props = {
    state: { index: focusedIndex, routes: ROUTES.map(({ key, name }) => ({ key, name })) },
    descriptors: Object.fromEntries(ROUTES.map(({ key, title }) => [key, { options: { title } }])),
    navigation,
    insets: TEST_SAFE_AREA_INSETS,
  } as unknown as TabBarProps;
  return { props, navigation };
}

beforeEach(() => mockColorScheme.mockReturnValue('light'));

describe('TabBar (docs/01 §8 → Bottom navigation)', () => {
  it('is a tab list of labeled tabs', () => {
    renderWithProviders(<TabBar {...makeProps().props} />);
    const bar = screen.getByTestId('tab-bar');
    expect(bar.props.accessibilityRole).toBe('tablist');
    expect(bar.props.accessible).not.toBe(true);
    expect(screen.getAllByRole('tab').map((node) => node.props.accessibilityLabel)).toEqual([
      'Home',
      'Forest',
      'Insights',
      'Profile',
    ]);
  });

  it('shows each label as text next to its icon', () => {
    renderWithProviders(<TabBar {...makeProps().props} />);
    for (const { title } of ROUTES) {
      expect(screen.getByText(title, { includeHiddenElements: true })).toBeOnTheScreen();
    }
  });

  it('marks only the focused tab as selected', () => {
    renderWithProviders(<TabBar {...makeProps(2).props} />);
    expect(screen.getByRole('tab', { name: 'Insights' })).toBeSelected();
    for (const name of ['Home', 'Forest', 'Profile']) {
      expect(screen.getByRole('tab', { name })).not.toBeSelected();
    }
  });

  it('navigates to a tab that is not focused, after announcing the press', () => {
    const { props, navigation } = makeProps(0);
    renderWithProviders(<TabBar {...props} />);
    fireEvent.press(screen.getByRole('tab', { name: 'Forest' }));
    expect(navigation.emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'forest-1',
      canPreventDefault: true,
    });
    expect(navigation.navigate).toHaveBeenCalledWith('forest');
  });

  it('does not navigate again when the focused tab is pressed', () => {
    const { props, navigation } = makeProps(0);
    renderWithProviders(<TabBar {...props} />);
    fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
    expect(navigation.emit).toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('respects a listener that prevents the default', () => {
    const { props, navigation } = makeProps(0, { prevented: true });
    renderWithProviders(<TabBar {...props} />);
    fireEvent.press(screen.getByRole('tab', { name: 'Forest' }));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  describe.each(themes)('in the %s theme', (scheme, theme) => {
    beforeEach(() => mockColorScheme.mockReturnValue(scheme));

    it('sits on surface.primary with a subtle top hairline', () => {
      renderWithProviders(<TabBar {...makeProps().props} />);
      expect(styleOf(screen.getByTestId('tab-bar'))).toMatchObject({
        backgroundColor: theme.colors.surface.primary,
        borderTopColor: theme.colors.border.subtle,
        borderTopWidth: StyleSheet.hairlineWidth,
      });
    });

    it('shows the active label in text.primary and the others in text.muted', () => {
      renderWithProviders(<TabBar {...makeProps(1).props} />);
      expect(styleOf(screen.getByText('Forest', { includeHiddenElements: true })).color).toBe(
        theme.colors.text.primary,
      );
      expect(styleOf(screen.getByText('Home', { includeHiddenElements: true })).color).toBe(
        theme.colors.text.muted,
      );
    });

    it('draws the filled icon for the active tab and the line icon for the others', () => {
      renderWithProviders(<TabBar {...makeProps(1).props} />);
      expect(
        screen.getByTestId('tab-icon-forest-filled', { includeHiddenElements: true }),
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId('tab-icon-index-line', { includeHiddenElements: true }),
      ).toBeOnTheScreen();
      expect(
        screen.queryByTestId('tab-icon-forest-line', { includeHiddenElements: true }),
      ).toBeNull();
    });
  });

  it('keeps the icons out of the screen reader, which reads the label', () => {
    renderWithProviders(<TabBar {...makeProps().props} />);
    expect(screen.queryByTestId('tab-icon-index-filled')).toBeNull();
  });

  it('gives every tab a hit area of at least 44×44', () => {
    renderWithProviders(<TabBar {...makeProps().props} />);
    for (const node of screen.getAllByRole('tab')) {
      expect(styleOf(node).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(styleOf(node).minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
  });

  it('clears the home indicator', () => {
    renderWithProviders(<TabBar {...makeProps().props} />);
    expect(styleOf(screen.getByTestId('tab-bar')).paddingBottom).toBe(TEST_SAFE_AREA_INSETS.bottom);
  });

  it('grows with large text instead of truncating labels', () => {
    renderWithProviders(<TabBar {...makeProps().props} />);
    expect(styleOf(screen.getByTestId('tab-bar')).height).toBeUndefined();
    const label = screen.getByText('Insights', { includeHiddenElements: true });
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.allowFontScaling).not.toBe(false);
    expect(styleOf(label)).toMatchObject({ fontSize: lightTheme.type.label.fontSize });
  });
});
