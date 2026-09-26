import { fireEvent, screen } from '@testing-library/react-native';
import { Animated, StyleSheet, Text } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { renderWithProviders } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { Card } from '../Card';

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

beforeEach(() => mockColorScheme.mockReturnValue('light'));
afterEach(() => jest.restoreAllMocks());

describe('Card (docs/01 §8 → Cards)', () => {
  describe.each(themes)('surface in the %s theme', (scheme, theme) => {
    beforeEach(() => mockColorScheme.mockReturnValue(scheme));

    it('uses surface.primary, radius.lg, elevation.1, and generous padding', () => {
      renderWithProviders(
        <Card testID="card">
          <Text>Today</Text>
        </Card>,
      );
      expect(styleOf(screen.getByTestId('card'))).toMatchObject({
        backgroundColor: theme.colors.surface.primary,
        borderRadius: theme.radius.lg,
        padding: theme.space[5],
        ...theme.elevation[1],
      });
    });

    it('can sit flat, with no elevation', () => {
      renderWithProviders(
        <Card testID="card" elevated={false}>
          <Text>Today</Text>
        </Card>,
      );
      expect(styleOf(screen.getByTestId('card'))).toMatchObject(theme.elevation[0]);
    });
  });

  describe('static card', () => {
    it('is not a button, and its content stays readable piece by piece', () => {
      renderWithProviders(
        <Card testID="card">
          <Text>Today</Text>
          <Text>42 min</Text>
        </Card>,
      );
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.getByTestId('card').props.accessible).not.toBe(true);
      expect(screen.getByText('Today')).toBeOnTheScreen();
      expect(screen.getByText('42 min')).toBeOnTheScreen();
    });
  });

  describe('tappable card', () => {
    const renderTappable = (onPress = jest.fn(), options = {}) =>
      renderWithProviders(
        <Card
          onPress={onPress}
          accessibilityLabel="September tree, Growing Tree"
          accessibilityHint="Opens tree details."
          testID="card"
        >
          <Text>September</Text>
        </Card>,
        options,
      );

    it('is one button with its own accessible name and hint', () => {
      renderTappable();
      const card = screen.getByRole('button', { name: 'September tree, Growing Tree' });
      expect(card.props.accessible).toBe(true);
      expect(card.props.accessibilityHint).toBe('Opens tree details.');
    });

    it('calls onPress once when pressed', () => {
      const onPress = jest.fn();
      renderTappable(onPress);
      fireEvent.press(screen.getByRole('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it.each(themes)('shows a full-card press state in the %s theme', (scheme, theme) => {
      mockColorScheme.mockReturnValue(scheme);
      renderTappable();
      const card = screen.getByRole('button');
      expect(styleOf(card).backgroundColor).toBe(theme.colors.surface.primary);

      fireEvent(card, 'pressIn');
      expect(styleOf(screen.getByRole('button')).backgroundColor).toBe(theme.colors.surface.sunken);

      fireEvent(screen.getByRole('button'), 'pressOut');
      expect(styleOf(screen.getByRole('button')).backgroundColor).toBe(
        theme.colors.surface.primary,
      );
    });

    it('scales slightly when pressed, and only shifts tone under reduced motion', () => {
      const timing = jest.spyOn(Animated, 'timing');
      renderTappable(jest.fn(), { reducedMotion: true });
      fireEvent(screen.getByRole('button'), 'pressIn');
      expect(timing).not.toHaveBeenCalled();
      expect(styleOf(screen.getByRole('button')).backgroundColor).toBe(
        lightTheme.colors.surface.sunken,
      );
    });

    it('refuses to be tappable without an accessible name', () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(() =>
        renderWithProviders(
          // @ts-expect-error: a tappable card needs an accessibilityLabel
          <Card onPress={jest.fn()}>
            <Text>September</Text>
          </Card>,
        ),
      ).toThrow(/accessibilityLabel/);
    });

    it('keeps the card surface on the pressable itself, so the whole card is the target', () => {
      renderTappable();
      expect(styleOf(screen.getByRole('button'))).toMatchObject({
        borderRadius: lightTheme.radius.lg,
        padding: lightTheme.space[5],
      });
      expect(styleOf(screen.getByRole('button')).height).toBeUndefined();
    });
  });
});
