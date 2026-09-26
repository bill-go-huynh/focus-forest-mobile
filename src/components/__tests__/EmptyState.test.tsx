import { fireEvent, screen } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { renderWithProviders, TEST_WINDOW } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { EmptyState, type EmptyStateProps } from '../EmptyState';

const mockColorScheme = jest.fn<'light' | 'dark', []>(() => 'light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

const mockWindow = { ...TEST_WINDOW, scale: 3, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

const themes = [
  ['light', lightTheme],
  ['dark', darkTheme],
] as const satisfies readonly (readonly ['light' | 'dark', Theme])[];

const styleOf = (element: ReactTestInstance) => StyleSheet.flatten(element.props.style);
const MESSAGE = "Your first session will plant this month's seed.";

beforeEach(() => {
  mockColorScheme.mockReturnValue('light');
  mockWindow.fontScale = 1;
});
afterEach(() => jest.restoreAllMocks());

describe('EmptyState (docs/01 §9: an opportunity, not an apology)', () => {
  it('shows a small illustration and one sentence', () => {
    renderWithProviders(<EmptyState illustration="seed-in-soil" message={MESSAGE} />);
    expect(
      screen.getByTestId('illustration-seed-in-soil', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    expect(screen.getByText(MESSAGE)).toBeOnTheScreen();
  });

  it('offers one primary action', () => {
    const onPress = jest.fn();
    renderWithProviders(
      <EmptyState
        illustration="seed-in-soil"
        message={MESSAGE}
        action={{ label: 'Start Focus', onPress }}
      />,
    );
    const button = screen.getByRole('button', { name: 'Start Focus' });
    expect(styleOf(button).backgroundColor).toBe(lightTheme.colors.accent.primary);
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('can have no action at all', () => {
    renderWithProviders(<EmptyState illustration="clearing" message="Nothing to show yet." />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('accepts only one action in its type', () => {
    const props: EmptyStateProps = {
      illustration: 'clearing',
      message: 'Nothing to show yet.',
      // @ts-expect-error: at most one action, not a list
      action: [{ label: 'A', onPress: jest.fn() }],
    };
    expect(props.message).toBe('Nothing to show yet.');
  });

  it('refuses more than one sentence', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      renderWithProviders(
        <EmptyState illustration="clearing" message="No sessions yet. Start one now." />,
      ),
    ).toThrow(/one sentence/);
  });

  it('refuses shaming language', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      renderWithProviders(
        <EmptyState illustration="clearing" message="You didn't focus this week." />,
      ),
    ).toThrow(/calm/);
  });

  it('refuses an empty message', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderWithProviders(<EmptyState illustration="clearing" message=" " />)).toThrow(
      /message/,
    );
  });

  it('lets screen readers read the sentence and skip the illustration', () => {
    renderWithProviders(<EmptyState illustration="seed-in-soil" message={MESSAGE} />);
    expect(screen.getByText(MESSAGE)).toBeOnTheScreen();
    expect(screen.queryByTestId('illustration-seed-in-soil')).toBeNull();
  });

  it.each(themes)('uses body text in text.primary, centered, in the %s theme', (scheme, theme) => {
    mockColorScheme.mockReturnValue(scheme);
    renderWithProviders(<EmptyState illustration="seed-in-soil" message={MESSAGE} />);
    expect(styleOf(screen.getByText(MESSAGE))).toMatchObject({
      fontSize: theme.type.body.fontSize,
      color: theme.colors.text.primary,
      textAlign: 'center',
    });
  });

  it('is calm: no motion at all (docs/04 §4)', () => {
    const timing = jest.spyOn(Animated, 'timing');
    const loop = jest.spyOn(Animated, 'loop');
    renderWithProviders(<EmptyState illustration="seed-in-soil" message={MESSAGE} />);
    expect(timing).not.toHaveBeenCalled();
    expect(loop).not.toHaveBeenCalled();
  });

  describe('large text (docs/11: usable at 200%)', () => {
    it('never truncates the sentence', () => {
      renderWithProviders(<EmptyState illustration="seed-in-soil" message={MESSAGE} />);
      expect(screen.getByText(MESSAGE).props.numberOfLines).toBeUndefined();
      expect(screen.getByText(MESSAGE).props.allowFontScaling).not.toBe(false);
    });

    it('shrinks the illustration at 200%, so the text keeps its room', () => {
      renderWithProviders(<EmptyState illustration="seed-in-soil" message={MESSAGE} />);
      const full = styleOf(
        screen.getByTestId('illustration-seed-in-soil', { includeHiddenElements: true }),
      ).width as number;

      mockWindow.fontScale = 2;
      renderWithProviders(<EmptyState illustration="clearing" message="Nothing to show yet." />);
      const large = styleOf(
        screen.getByTestId('illustration-clearing', { includeHiddenElements: true }),
      ).width as number;

      expect(full).toBe(lightTheme.illustration.spot);
      expect(large).toBeLessThan(full);
    });
  });
});
