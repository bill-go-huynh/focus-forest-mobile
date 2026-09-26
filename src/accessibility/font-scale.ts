import { useWindowDimensions } from 'react-native';

/** Layouts must stay usable at this system text size (docs/11_ACCESSIBILITY.md). */
export const LARGE_TEXT_SCALE = 2;

/**
 * The system font scale, for layouts that adapt to large text (for example, the
 * timer shrinks the tree before the digits). Text itself always scales on its own.
 */
export function useFontScale(): {
  fontScale: number;
  isLargeText: boolean;
  scaled: (size: number) => number;
} {
  const { fontScale } = useWindowDimensions();
  return {
    fontScale,
    isLargeText: fontScale >= LARGE_TEXT_SCALE,
    scaled: (size) => size * fontScale,
  };
}
