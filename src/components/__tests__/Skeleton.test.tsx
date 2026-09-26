import { screen } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

import { renderWithProviders, TEST_WINDOW } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { Skeleton, SkeletonGroup } from '../Skeleton';

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
const bones = () => screen.getAllByTestId('skeleton', { includeHiddenElements: true });
const bone = (index = 0) => {
  const node = bones()[index];
  if (!node) throw new Error(`No skeleton at index ${index}.`);
  return node;
};

let loop: jest.SpyInstance;
let loopStop: jest.Mock;
beforeEach(() => {
  mockColorScheme.mockReturnValue('light');
  mockWindow.fontScale = 1;
  loopStop = jest.fn();
  loop = jest
    .spyOn(Animated, 'loop')
    .mockReturnValue({ start: jest.fn(), stop: loopStop, reset: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

describe('Skeleton (docs/01 §9 → Loading states)', () => {
  describe.each(themes)('in the %s theme', (scheme, theme) => {
    beforeEach(() => mockColorScheme.mockReturnValue(scheme));

    it('uses the surface tone', () => {
      renderWithProviders(<Skeleton variant="block" height={theme.space[16]} />);
      expect(styleOf(bone()).backgroundColor).toBe(theme.colors.surface.sunken);
    });
  });

  it.each([
    ['text', lightTheme.radius.sm],
    ['block', lightTheme.radius.lg],
    ['circle', lightTheme.radius.full],
  ] as const)('shapes a %s placeholder with its radius token', (variant, radius) => {
    renderWithProviders(<Skeleton variant={variant} height={lightTheme.space[12]} />);
    expect(styleOf(bone()).borderRadius).toBe(radius);
  });

  it('draws the requested number of text lines, the last one shorter', () => {
    renderWithProviders(<Skeleton variant="text" lines={3} />);
    const lines = bones();
    expect(lines).toHaveLength(3);
    expect(styleOf(bone(0)).width).toBe('100%');
    expect(styleOf(bone(2)).width).not.toBe('100%');
  });

  it('sizes text lines to the body line height at the default text size', () => {
    renderWithProviders(<Skeleton variant="text" />);
    expect(styleOf(bone()).height).toBe(lightTheme.type.body.lineHeight);
  });

  it('grows text lines with the system text size, so the layout matches at 200%', () => {
    mockWindow.fontScale = 2;
    renderWithProviders(<Skeleton variant="text" />);
    expect(styleOf(bone()).height).toBe(lightTheme.type.body.lineHeight * 2);
  });

  it('keeps a circle as wide as it is tall', () => {
    renderWithProviders(<Skeleton variant="circle" height={lightTheme.icon.lg} />);
    expect(styleOf(bone())).toMatchObject({
      width: lightTheme.icon.lg,
      height: lightTheme.icon.lg,
    });
  });

  it('is hidden from screen readers on its own', () => {
    renderWithProviders(<Skeleton variant="text" />);
    expect(screen.queryByTestId('skeleton')).toBeNull();
  });

  describe('shimmer', () => {
    it('breathes slowly and subtly with motion on', () => {
      const timing = jest.spyOn(Animated, 'timing');
      renderWithProviders(<Skeleton variant="text" />);
      expect(loop).toHaveBeenCalledTimes(1);
      expect(timing).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          toValue: lightTheme.opacity.muted,
          duration: lightTheme.motion.growth,
        }),
      );
    });

    it('stops when it leaves the screen', () => {
      const { unmount } = renderWithProviders(<Skeleton variant="text" />);
      unmount();
      expect(loopStop).toHaveBeenCalled();
    });

    it('does not shimmer at all under reduced motion', () => {
      const timing = jest.spyOn(Animated, 'timing');
      renderWithProviders(<Skeleton variant="text" lines={2} />, { reducedMotion: true });
      expect(loop).not.toHaveBeenCalled();
      expect(timing).not.toHaveBeenCalled();
      for (const bone of bones()) {
        expect(styleOf(bone).opacity).toBe(1);
      }
    });
  });
});

describe('SkeletonGroup', () => {
  it('tells screen readers that the area is loading, as one element', () => {
    renderWithProviders(
      <SkeletonGroup>
        <Skeleton variant="text" lines={2} />
        <Skeleton variant="block" height={lightTheme.space[16]} />
      </SkeletonGroup>,
    );
    const group = screen.getByLabelText('Loading');
    expect(group.props.accessible).toBe(true);
    expect(group.props.accessibilityState).toMatchObject({ busy: true });
  });

  it('can name what is loading', () => {
    renderWithProviders(
      <SkeletonGroup label="Loading your history">
        <Skeleton variant="text" />
      </SkeletonGroup>,
    );
    expect(screen.getByLabelText('Loading your history')).toBeOnTheScreen();
  });
});
