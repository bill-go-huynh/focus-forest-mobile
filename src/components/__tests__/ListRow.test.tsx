import { fireEvent, screen } from '@testing-library/react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { MIN_TOUCH_TARGET } from '../../accessibility';
import { renderWithProviders } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { ListRow } from '../ListRow';

const mockColorScheme = jest.fn<'light' | 'dark', []>(() => 'light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

const mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

const themes = [
  ['light', lightTheme],
  ['dark', darkTheme],
] as const satisfies readonly (readonly ['light' | 'dark', Theme])[];

const styleOf = (element: ReactTestInstance) => StyleSheet.flatten(element.props.style);
const icon = ({ color, size }: { color: string; size: number }) => (
  <Text>{`icon ${color} ${size}`}</Text>
);

beforeEach(() => {
  mockColorScheme.mockReturnValue('light');
  mockWindow.fontScale = 1;
});
afterEach(() => jest.restoreAllMocks());

describe('ListRow (docs/01 §8 → Lists)', () => {
  it('shows the main content, a secondary line, and trailing meta', () => {
    renderWithProviders(
      <ListRow leading={icon} title="Deep Work" subtitle="Morning session" meta="25 min" />,
    );
    expect(screen.getByText('Deep Work')).toBeOnTheScreen();
    expect(screen.getByText('Morning session')).toBeOnTheScreen();
    expect(screen.getByText('25 min')).toBeOnTheScreen();
  });

  it.each(themes)('uses text tokens for each line in the %s theme', (scheme, theme) => {
    mockColorScheme.mockReturnValue(scheme);
    renderWithProviders(
      <ListRow leading={icon} title="Deep Work" subtitle="Morning session" meta="25 min" />,
    );
    expect(styleOf(screen.getByText('Deep Work'))).toMatchObject({
      color: theme.colors.text.primary,
      fontSize: theme.type.body.fontSize,
    });
    expect(styleOf(screen.getByText('Morning session'))).toMatchObject({
      color: theme.colors.text.secondary,
      fontSize: theme.type.caption.fontSize,
    });
    expect(styleOf(screen.getByText('25 min'))).toMatchObject({
      color: theme.colors.text.muted,
      fontSize: theme.type.caption.fontSize,
    });
    expect(
      screen.getByText(`icon ${theme.colors.text.secondary} ${theme.icon.md}`, {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
  });

  it('uses the documented row spacing and a 44 pt minimum height', () => {
    renderWithProviders(<ListRow title="Deep Work" testID="row" />);
    expect(styleOf(screen.getByTestId('row'))).toMatchObject({
      paddingVertical: lightTheme.space[3],
      paddingHorizontal: lightTheme.space[4],
      borderRadius: lightTheme.radius.md,
      minHeight: MIN_TOUCH_TARGET,
    });
  });

  it('hides the leading icon from screen readers', () => {
    renderWithProviders(<ListRow leading={icon} title="Deep Work" />);
    expect(screen.queryByText(/^icon/)).toBeNull();
  });

  it('refuses an empty title', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderWithProviders(<ListRow title="" />)).toThrow(/title/);
  });

  describe('static row', () => {
    it('is read as one element that joins its lines, and is not a button', () => {
      renderWithProviders(
        <ListRow title="Deep Work" subtitle="Morning session" meta="25 min" testID="row" />,
      );
      expect(screen.queryByRole('button')).toBeNull();
      const content = screen.getByLabelText('Deep Work, Morning session, 25 min');
      expect(content.props.accessible).toBe(true);
    });
  });

  describe('tappable row', () => {
    it('is one button named by all of its lines', () => {
      const onPress = jest.fn();
      renderWithProviders(
        <ListRow
          title="Deep Work"
          meta="25 min"
          onPress={onPress}
          accessibilityHint="Opens the session."
        />,
      );
      const row = screen.getByRole('button', { name: 'Deep Work, 25 min' });
      expect(row.props.accessibilityHint).toBe('Opens the session.');
      fireEvent.press(row);
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it.each(themes)('shifts tone while pressed in the %s theme', (scheme, theme) => {
      mockColorScheme.mockReturnValue(scheme);
      renderWithProviders(<ListRow title="Deep Work" onPress={jest.fn()} />);
      const row = screen.getByRole('button');
      expect(styleOf(row).backgroundColor).toBeUndefined();
      fireEvent(row, 'pressIn');
      expect(styleOf(screen.getByRole('button')).backgroundColor).toBe(theme.colors.surface.sunken);
    });

    it('cannot be pressed when disabled, and explains why', () => {
      const onPress = jest.fn();
      renderWithProviders(
        <ListRow
          title="Export"
          onPress={onPress}
          disabled
          disabledReason="Available after your first session."
        />,
      );
      const row = screen.getByRole('button', { name: 'Export' });
      fireEvent.press(row);
      expect(onPress).not.toHaveBeenCalled();
      expect(row).toBeDisabled();
      expect(row.props.accessibilityHint).toBe('Available after your first session.');
    });
  });

  describe('trailing action', () => {
    const action = (
      <Pressable accessibilityRole="button" accessibilityLabel="Edit Deep Work" onPress={jest.fn()}>
        <Text>Edit</Text>
      </Pressable>
    );

    it('keeps the action as its own button beside the row content', () => {
      renderWithProviders(<ListRow title="Deep Work" meta="Moss" action={action} />);
      expect(screen.getByRole('button', { name: 'Edit Deep Work' })).toBeOnTheScreen();
      expect(screen.getByLabelText('Deep Work, Moss').props.accessible).toBe(true);
    });

    it('cannot be combined with a tappable row, which would nest two buttons', () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(() =>
        renderWithProviders(
          // @ts-expect-error: a row is either tappable or has a trailing action
          <ListRow title="Deep Work" onPress={jest.fn()} action={action} />,
        ),
      ).toThrow(/action/);
    });
  });

  describe('large text (docs/11: usable at 200%)', () => {
    it('keeps the meta beside the title at the default size', () => {
      renderWithProviders(<ListRow title="Deep Work" meta="25 min" testID="row" />);
      expect(styleOf(screen.getByTestId('row-body')).flexDirection).toBe('row');
    });

    it('moves the meta under the title at 200%, and never truncates', () => {
      mockWindow.fontScale = 2;
      renderWithProviders(
        <ListRow
          title="A long topic name for language practice"
          subtitle="Tuesday evening"
          meta="1 h 25 min"
          testID="row"
        />,
      );
      expect(styleOf(screen.getByTestId('row-body')).flexDirection).toBe('column');
      for (const text of [
        'A long topic name for language practice',
        'Tuesday evening',
        '1 h 25 min',
      ]) {
        expect(screen.getByText(text).props.numberOfLines).toBeUndefined();
        expect(screen.getByText(text).props.allowFontScaling).not.toBe(false);
      }
      expect(styleOf(screen.getByTestId('row')).height).toBeUndefined();
    });
  });
});
