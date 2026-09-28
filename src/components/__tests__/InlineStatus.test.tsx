import { fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { Circle, Path } from 'react-native-svg';
import type { ReactTestInstance } from 'react-test-renderer';

import { renderWithProviders } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { InlineStatus, type InlineStatusTone } from '../InlineStatus';

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
const TONES: InlineStatusTone[] = ['neutral', 'info', 'attention'];

const styleOf = (element: ReactTestInstance) => StyleSheet.flatten(element.props.style);
const shapes = () =>
  screen.UNSAFE_root.findAll((node) => [Circle, Path].includes(node.type as never));

let announceSpy: jest.SpyInstance;
beforeEach(() => {
  mockColorScheme.mockReturnValue('light');
  mockWindow.fontScale = 1;
  announceSpy = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation()
    .mockClear();
});
afterEach(() => jest.restoreAllMocks());

describe('InlineStatus (neutral inline feedback: pending sync, saved data, attention)', () => {
  it('shows the message and detail, read together as one element', () => {
    renderWithProviders(
      <InlineStatus
        tone="neutral"
        message="Saved on this device."
        detail="It will sync when you're back online."
        testID="status"
      />,
    );
    expect(screen.getByText('Saved on this device.')).toBeOnTheScreen();
    expect(screen.getByText("It will sync when you're back online.")).toBeOnTheScreen();
    const element = screen.getByLabelText(
      "Saved on this device. It will sync when you're back online.",
    );
    expect(element.props.accessible).toBe(true);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names nothing twice: without a detail the label is the message', () => {
    renderWithProviders(<InlineStatus tone="info" message="Showing your saved topics." />);
    expect(screen.getByLabelText('Showing your saved topics.')).toBeOnTheScreen();
  });

  it.each(TONES)('marks the %s tone with its own shape, hidden from screen readers', (tone) => {
    renderWithProviders(<InlineStatus tone={tone} message="Waiting to sync." />);
    const glyph = screen.getByTestId(`inline-status-glyph-${tone}`, {
      includeHiddenElements: true,
    });
    expect(glyph.props.accessibilityElementsHidden).toBe(true);
    expect(glyph.props.importantForAccessibility).toBe('no-hide-descendants');
    for (const other of TONES.filter((t) => t !== tone)) {
      expect(
        screen.queryByTestId(`inline-status-glyph-${other}`, { includeHiddenElements: true }),
      ).toBeNull();
    }
  });

  it('draws a different shape for each tone, so the tone never depends on color', () => {
    const outlines = TONES.map((tone) => {
      const { unmount } = renderWithProviders(<InlineStatus tone={tone} message="Waiting." />);
      const outline = JSON.stringify(
        shapes().map(({ props: { d, cx, cy, r } }) => ({ d, cx, cy, r })),
      );
      unmount();
      return outline;
    });
    expect(new Set(outlines).size).toBe(TONES.length);
  });

  describe.each(themes)('%s theme', (scheme, theme) => {
    beforeEach(() => mockColorScheme.mockReturnValue(scheme));

    it('keeps the text in the primary text color for every tone: color never carries the meaning', () => {
      for (const tone of TONES) {
        const { unmount } = renderWithProviders(
          <InlineStatus tone={tone} message="Waiting to sync." detail="Nothing is lost." />,
        );
        expect(styleOf(screen.getByText('Waiting to sync.')).color).toBe(theme.colors.text.primary);
        expect(styleOf(screen.getByText('Nothing is lost.')).color).toBe(
          theme.colors.text.secondary,
        );
        unmount();
      }
    });

    it.each([
      ['neutral', (t: Theme) => t.colors.text.muted],
      ['info', (t: Theme) => t.colors.info],
      ['attention', (t: Theme) => t.colors.warning],
    ] as const)('draws the %s tone from theme tokens, never danger red', (tone, color) => {
      renderWithProviders(<InlineStatus tone={tone} message="Waiting to sync." testID="status" />);
      const strokes = shapes().map((shape) => shape.props.stroke as string);
      expect(strokes.length).toBeGreaterThan(0);
      for (const stroke of strokes) {
        expect(stroke).toBe(color(theme));
        expect(stroke).not.toBe(theme.colors.danger);
      }
      expect(styleOf(screen.getByTestId('status')).backgroundColor).toBe(
        theme.colors.surface.sunken,
      );
    });
  });

  describe('an action', () => {
    it('is its own button, next to the text, and calls onPress once', () => {
      const onPress = jest.fn();
      renderWithProviders(
        <InlineStatus
          tone="attention"
          message="This name is already used."
          action={{ label: 'Choose another name', onPress }}
        />,
      );
      fireEvent.press(screen.getByRole('button', { name: 'Choose another name' }));
      expect(onPress).toHaveBeenCalledTimes(1);
      // The text is one element and the button sits beside it, not inside: an accessible
      // element hides its descendants from screen readers, so a nested button could not be
      // reached.
      const text = screen.getByLabelText('This name is already used.');
      expect(text.findAll((node) => node.props.accessibilityRole === 'button')).toHaveLength(0);
    });

    it('is not triggered by pressing the message', () => {
      const onPress = jest.fn();
      renderWithProviders(
        <InlineStatus
          tone="attention"
          message="This name is already used."
          action={{ label: 'Choose another name', onPress }}
        />,
      );
      fireEvent.press(screen.getByText('This name is already used.'));
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('announcing', () => {
    it('says the status when it appears and when its wording changes, if live', () => {
      const view = renderWithProviders(<InlineStatus tone="info" message="Syncing." live />);
      expect(announceSpy).toHaveBeenCalledWith('Syncing.');
      expect(screen.getByLabelText('Syncing.').props.accessibilityLiveRegion).toBe('polite');

      view.rerender(<InlineStatus tone="info" message="Syncing." live />);
      expect(announceSpy).toHaveBeenCalledTimes(1);

      view.rerender(<InlineStatus tone="neutral" message="All saved." live />);
      expect(announceSpy).toHaveBeenLastCalledWith('All saved.');
    });

    it('stays quiet when not live (a status that is simply part of the screen)', () => {
      renderWithProviders(<InlineStatus tone="info" message="Showing your saved topics." />);
      expect(announceSpy).not.toHaveBeenCalled();
      expect(
        screen.getByLabelText('Showing your saved topics.').props.accessibilityLiveRegion,
      ).toBeUndefined();
    });
  });

  describe('large text', () => {
    it('never fixes a height or truncates the text', () => {
      renderWithProviders(
        <InlineStatus
          tone="neutral"
          message="A long status that has to wrap over several lines at large sizes."
          detail="And a detail line."
          testID="status"
        />,
      );
      const box = styleOf(screen.getByTestId('status'));
      expect(box.height).toBeUndefined();
      expect(box.maxHeight).toBeUndefined();
      for (const text of [
        'A long status that has to wrap over several lines at large sizes.',
        'And a detail line.',
      ]) {
        expect(screen.getByText(text).props.numberOfLines).toBeUndefined();
      }
    });

    it('puts the action under the text at 200%, so neither is squeezed', () => {
      const action = { label: 'Review', onPress: jest.fn() };
      const view = renderWithProviders(
        <InlineStatus tone="attention" message="Needs a look." action={action} testID="status" />,
      );
      expect(styleOf(screen.getByTestId('status')).flexDirection).toBe('row');

      mockWindow.fontScale = 2;
      view.rerender(
        <InlineStatus tone="attention" message="Needs a look." action={action} testID="status" />,
      );
      expect(styleOf(screen.getByTestId('status')).flexDirection).toBe('column');
    });
  });

  describe('copy', () => {
    it('refuses shaming words', () => {
      jest.spyOn(console, 'error').mockImplementation();
      expect(() =>
        renderWithProviders(<InlineStatus tone="attention" message="Sync failed." />),
      ).toThrow(/calm/);
    });

    it('needs a message: it is what the status says', () => {
      jest.spyOn(console, 'error').mockImplementation();
      expect(() => renderWithProviders(<InlineStatus tone="info" message="  " />)).toThrow(
        /message/,
      );
    });
  });
});
