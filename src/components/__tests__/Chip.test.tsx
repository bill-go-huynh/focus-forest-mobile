import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { MIN_TOUCH_TARGET } from '../../accessibility';
import { renderWithProviders } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { Chip } from '../Chip';

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
const chip = (name: string) => screen.getByRole('button', { name });

beforeEach(() => mockColorScheme.mockReturnValue('light'));
afterEach(() => jest.restoreAllMocks());

describe('Chip (docs/01 §8 → Chips: topics, filters, presets)', () => {
  it('is a button named by its label', () => {
    renderWithProviders(<Chip label="25 min" selected={false} onPress={jest.fn()} />);
    expect(chip('25 min')).toBeOnTheScreen();
    expect(screen.getByText('25 min')).toBeOnTheScreen();
  });

  it('calls onPress once when pressed', () => {
    const onPress = jest.fn();
    renderWithProviders(<Chip label="This week" selected={false} onPress={onPress} />);
    fireEvent.press(chip('This week'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  describe('selected state', () => {
    it('tells screen readers when it is selected', () => {
      renderWithProviders(<Chip label="Deep Work" selected onPress={jest.fn()} />);
      expect(chip('Deep Work')).toBeSelected();
    });

    it('tells screen readers when it is not selected', () => {
      renderWithProviders(<Chip label="Deep Work" selected={false} onPress={jest.fn()} />);
      expect(chip('Deep Work')).not.toBeSelected();
      expect(chip('Deep Work').props.accessibilityState).toMatchObject({ selected: false });
    });

    describe.each(themes)('in the %s theme', (scheme, theme) => {
      beforeEach(() => mockColorScheme.mockReturnValue(scheme));

      it('uses the accent.soft fill when selected and a tonal fill when not', () => {
        const { rerender } = renderWithProviders(
          <Chip label="Study" selected onPress={jest.fn()} />,
        );
        expect(styleOf(chip('Study')).backgroundColor).toBe(theme.colors.accent.soft);

        rerender(<Chip label="Study" selected={false} onPress={jest.fn()} />);
        expect(styleOf(chip('Study')).backgroundColor).toBe(theme.colors.surface.sunken);
      });

      it('marks selection with an accent outline too, not with fill color alone', () => {
        const { rerender } = renderWithProviders(
          <Chip label="Study" selected onPress={jest.fn()} />,
        );
        const selected = styleOf(chip('Study'));
        expect(selected.borderColor).toBe(theme.colors.accent.primary);
        expect(selected.borderWidth).toBe(theme.control.borderWidth);

        rerender(<Chip label="Study" selected={false} onPress={jest.fn()} />);
        const unselected = styleOf(chip('Study'));
        // Same width when unselected, so selecting never shifts the layout.
        expect(unselected.borderWidth).toBe(theme.control.borderWidth);
        expect(unselected.borderColor).toBe(theme.colors.surface.sunken);
      });

      it('keeps the label in text.primary', () => {
        renderWithProviders(<Chip label="Study" selected onPress={jest.fn()} />);
        expect(styleOf(screen.getByText('Study')).color).toBe(theme.colors.text.primary);
      });
    });
  });

  it('shifts tone slightly while pressed', () => {
    renderWithProviders(<Chip label="Study" selected={false} onPress={jest.fn()} />);
    fireEvent(chip('Study'), 'pressIn');
    expect(styleOf(chip('Study')).backgroundColor).toBe(lightTheme.colors.background.secondary);
  });

  it('is a pill with a hit area of at least 44×44', () => {
    renderWithProviders(<Chip label="5" selected={false} onPress={jest.fn()} />);
    const style = styleOf(chip('5'));
    expect(style.borderRadius).toBe(lightTheme.radius.full);
    expect(style.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(style.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });

  describe('topic chips (docs/11: color plus icon plus name, never color alone)', () => {
    it('shows the topic color dot from the curated topic tokens, next to the visible name', () => {
      renderWithProviders(
        <Chip label="Reading" topicColor={4} selected={false} onPress={jest.fn()} />,
      );
      const dot = screen.getByTestId('chip-topic-dot', { includeHiddenElements: true });
      expect(styleOf(dot).backgroundColor).toBe(lightTheme.colors.topic[4]);
      expect(screen.getByText('Reading')).toBeOnTheScreen();
      expect(chip('Reading')).toBeOnTheScreen();
    });

    it('uses the dark theme topic color in dark mode', () => {
      mockColorScheme.mockReturnValue('dark');
      renderWithProviders(<Chip label="Reading" topicColor={4} selected onPress={jest.fn()} />);
      const dot = screen.getByTestId('chip-topic-dot', { includeHiddenElements: true });
      expect(styleOf(dot).backgroundColor).toBe(darkTheme.colors.topic[4]);
    });

    it('hides the dot and icon from screen readers, which read the name instead', () => {
      const icon = ({ color, size }: { color: string; size: number }) => (
        <Text>{`icon ${color} ${size}`}</Text>
      );
      renderWithProviders(
        <Chip label="Reading" topicColor={4} icon={icon} selected={false} onPress={jest.fn()} />,
      );
      expect(screen.queryByTestId('chip-topic-dot')).toBeNull();
      expect(screen.queryByText(/^icon/)).toBeNull();
      expect(
        screen.getByText(`icon ${lightTheme.colors.text.primary} ${lightTheme.icon.sm}`, {
          includeHiddenElements: true,
        }),
      ).toBeOnTheScreen();
    });

    it('refuses a chip without a name, so a topic is never shown by color alone', () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(() =>
        renderWithProviders(<Chip label=" " topicColor={2} selected onPress={jest.fn()} />),
      ).toThrow(/label/);
    });

    it('draws no dot when no topic color is given', () => {
      renderWithProviders(<Chip label="All" selected onPress={jest.fn()} />);
      expect(screen.queryByTestId('chip-topic-dot', { includeHiddenElements: true })).toBeNull();
    });
  });

  describe('when disabled', () => {
    it('cannot be pressed, says so, and explains why', () => {
      const onPress = jest.fn();
      renderWithProviders(
        <Chip
          label="Music"
          selected={false}
          onPress={onPress}
          disabled
          disabledReason="Archived topics can't be picked."
        />,
      );
      fireEvent.press(chip('Music'));
      expect(onPress).not.toHaveBeenCalled();
      expect(chip('Music')).toBeDisabled();
      expect(chip('Music').props.accessibilityHint).toBe("Archived topics can't be picked.");
      expect(styleOf(chip('Music')).opacity).toBe(lightTheme.opacity.disabled);
    });
  });

  it('wraps a long label at large text sizes instead of truncating it', () => {
    renderWithProviders(
      <Chip label="Language practice with friends" selected={false} onPress={jest.fn()} />,
    );
    const label = screen.getByText('Language practice with friends');
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.allowFontScaling).not.toBe(false);
    expect(styleOf(label)).toMatchObject({
      fontSize: lightTheme.type.label.fontSize,
      flexShrink: 1,
    });
    expect(styleOf(chip('Language practice with friends')).height).toBeUndefined();
  });
});
