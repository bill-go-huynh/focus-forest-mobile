import { act, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Circle } from 'react-native-svg';
import type { ReactTestInstance } from 'react-test-renderer';

import { mockControlledTiming } from '../../test-utils/animation';
import { renderWithProviders, TEST_WINDOW } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { clampProgress, ProgressRing } from '../ProgressRing';

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

const { size, strokeWidth } = lightTheme.progressRing;
const circumference = 2 * Math.PI * ((size - strokeWidth) / 2);
const offsetFor = (percent: number) => circumference * (1 - percent / 100);

const ring = () => screen.getByRole('progressbar');
// react-native-svg encodes props for the native view (colors become integers), so the
// tests read the props given to the Circle component itself.
const circle = (testID: string) =>
  screen.UNSAFE_root.findAll((node) => node.type === Circle && node.props.testID === testID)[0];
const arc = () => {
  const node = circle('progress-ring-arc');
  if (!node) throw new Error('No progress arc is drawn.');
  return node;
};
const queryArc = () => circle('progress-ring-arc') ?? null;
const track = () => {
  const node = circle('progress-ring-track');
  if (!node) throw new Error('No progress track is drawn.');
  return node;
};

let timing: ReturnType<typeof mockControlledTiming>;
beforeEach(() => {
  mockColorScheme.mockReturnValue('light');
  mockWindow.fontScale = 1;
  timing = mockControlledTiming();
});
afterEach(() => jest.restoreAllMocks());

describe('clampProgress', () => {
  it.each([
    [0, 0],
    [42, 42],
    [100, 100],
    [-5, 0],
    [140, 100],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 100],
    [Number.NEGATIVE_INFINITY, 0],
  ])('clamps %p to %p', (input, expected) => {
    expect(clampProgress(input)).toBe(expected);
  });
});

describe('ProgressRing (docs/01 §8 → Progress indicators)', () => {
  const renderRing = (props: Partial<Parameters<typeof ProgressRing>[0]> = {}, options = {}) =>
    renderWithProviders(
      <ProgressRing progress={70} label="Daily goal" valueText="42 / 60 min" {...props} />,
      options,
    );

  describe('text always comes with the ring (docs/11: not the circle alone)', () => {
    it('shows the label and the value as text beside the ring', () => {
      renderRing();
      expect(screen.getByText('Daily goal', { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.getByText('42 / 60 min', { includeHiddenElements: true })).toBeOnTheScreen();
    });

    it.each([
      ['label', { label: ' ' }],
      ['valueText', { valueText: '' }],
    ])('refuses an empty %s', (name, props) => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(() => renderRing(props)).toThrow(new RegExp(name));
    });
  });

  describe('screen readers', () => {
    it('reads it as one progress bar with its label', () => {
      renderRing();
      expect(screen.getByRole('progressbar', { name: 'Daily goal' })).toBeOnTheScreen();
      expect(ring().props.accessible).toBe(true);
    });

    it('reads the value text and the percentage', () => {
      renderRing();
      expect(ring().props.accessibilityValue).toEqual({
        min: 0,
        max: 100,
        now: 70,
        text: '42 / 60 min',
      });
    });

    it('reports the clamped value, never one outside 0–100', () => {
      renderRing({ progress: 130, valueText: '78 / 60 min' });
      expect(ring().props.accessibilityValue).toMatchObject({ now: 100 });
    });

    it('rounds the reported percentage to a whole number', () => {
      renderRing({ progress: 33.333 });
      expect(ring().props.accessibilityValue).toMatchObject({ now: 33 });
    });

    it('hides the drawing itself, which the text already describes', () => {
      renderRing();
      expect(screen.queryByTestId('progress-ring-arc')).toBeNull();
      expect(screen.getByTestId('progress-ring-arc', { includeHiddenElements: true })).toBeTruthy();
    });
  });

  describe.each(themes)('colors in the %s theme', (scheme, theme) => {
    beforeEach(() => mockColorScheme.mockReturnValue(scheme));

    it('draws goal progress in forest.primary on a forest.soft track', () => {
      renderRing();
      expect(arc().props.stroke).toBe(theme.colors.forest.primary);
      expect(track().props.stroke).toBe(theme.colors.forest.soft);
    });

    it('can use the accent tone', () => {
      renderRing({ tone: 'accent' });
      expect(arc().props.stroke).toBe(theme.colors.accent.primary);
      expect(track().props.stroke).toBe(theme.colors.accent.soft);
    });

    it.each([0, 50, 100, 140, -10])('never turns red, whatever the progress (%p)', (progress) => {
      renderRing({ progress });
      act(() => timing.finishAll());
      for (const color of [track().props.stroke, queryArc()?.props.stroke]) {
        expect(color).not.toBe(theme.colors.danger);
        expect(color).not.toBe(theme.colors.warning);
      }
    });

    it('uses text tokens for the label and value', () => {
      renderRing();
      expect(
        styleOf(screen.getByText('Daily goal', { includeHiddenElements: true })),
      ).toMatchObject({
        color: theme.colors.text.secondary,
        fontSize: theme.type.caption.fontSize,
      });
      expect(
        styleOf(screen.getByText('42 / 60 min', { includeHiddenElements: true })),
      ).toMatchObject({
        color: theme.colors.text.primary,
        fontSize: theme.type.bodyStrong.fontSize,
      });
    });
  });

  describe('drawing', () => {
    it('uses the ring size and stroke tokens, with rounded caps', () => {
      renderRing();
      expect(arc().props.strokeWidth).toBe(strokeWidth);
      expect(arc().props.strokeLinecap).toBe('round');
      expect(track().props.strokeWidth).toBe(strokeWidth);
    });

    it('fills the arc in proportion to the progress', () => {
      renderRing({ progress: 25 }, { reducedMotion: true });
      expect(arc().props.strokeDasharray).toEqual([circumference, circumference]);
      expect(arc().props.strokeDashoffset).toBeCloseTo(offsetFor(25));
    });

    it('draws a full ring at 100% and at clamped values above it', () => {
      renderRing({ progress: 250 }, { reducedMotion: true });
      expect(arc().props.strokeDashoffset).toBeCloseTo(0);
    });

    it('draws no arc at 0%, so a rounded cap never shows a stray dot', () => {
      renderRing({ progress: 0 }, { reducedMotion: true });
      expect(queryArc()).toBeNull();
      expect(track()).toBeTruthy();
    });

    it('treats a negative or invalid progress as 0', () => {
      renderRing({ progress: Number.NaN }, { reducedMotion: true });
      expect(queryArc()).toBeNull();
      expect(ring().props.accessibilityValue).toMatchObject({ now: 0 });
    });
  });

  describe('motion (docs/04: motion.progress)', () => {
    it('animates to the new progress with the motion.progress token', () => {
      renderRing({ progress: 70 });
      expect(timing.spy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ toValue: 70, duration: lightTheme.motion.progress }),
      );
    });

    it('animates again when the progress changes', () => {
      const { rerender } = renderRing({ progress: 20 });
      act(() => timing.finishAll());
      rerender(<ProgressRing progress={60} label="Daily goal" valueText="36 / 60 min" />);
      expect(timing.spy).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ toValue: 60, duration: lightTheme.motion.progress }),
      );
    });

    it('animates to the clamped value', () => {
      renderRing({ progress: 180 });
      expect(timing.spy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ toValue: 100 }),
      );
    });

    it('shows the final state at once under reduced motion, with no animation', () => {
      renderRing({ progress: 70 }, { reducedMotion: true });
      expect(timing.spy).not.toHaveBeenCalled();
      expect(arc().props.strokeDashoffset).toBeCloseTo(offsetFor(70));
    });

    it('jumps to a changed value under reduced motion, too', () => {
      const { rerender } = renderRing({ progress: 20 }, { reducedMotion: true });
      rerender(<ProgressRing progress={60} label="Daily goal" valueText="36 / 60 min" />);
      expect(timing.spy).not.toHaveBeenCalled();
      expect(arc().props.strokeDashoffset).toBeCloseTo(offsetFor(60));
    });

    it('updates the spoken value immediately, even while the ring animates', () => {
      renderRing({ progress: 70 });
      expect(ring().props.accessibilityValue).toMatchObject({ now: 70, text: '42 / 60 min' });
    });
  });

  describe('large text (docs/11: usable at 200%)', () => {
    it('keeps the text beside the ring at the default size', () => {
      renderRing();
      expect(styleOf(ring()).flexDirection).toBe('row');
    });

    it('stacks the text under the ring at 200%, and never truncates it', () => {
      mockWindow.fontScale = 2;
      renderRing({ valueText: '42 of 60 minutes today' });
      expect(styleOf(ring()).flexDirection).toBe('column');
      for (const text of ['Daily goal', '42 of 60 minutes today']) {
        const node = screen.getByText(text, { includeHiddenElements: true });
        expect(node.props.numberOfLines).toBeUndefined();
        expect(node.props.allowFontScaling).not.toBe(false);
      }
    });
  });
});
