import type { Insets } from 'react-native';

/** Minimum hit area for any interactive element, in points (docs/11_ACCESSIBILITY.md). */
export const MIN_TOUCH_TARGET = 44;

/**
 * The hitSlop that grows a control of the given visual size to at least 44×44,
 * split evenly on both sides. Controls that are already large enough get no slop.
 */
export function touchTargetHitSlop(size: { width: number; height: number }): Required<Insets> {
  if (size.width < 0 || size.height < 0) {
    throw new Error('Touch target sizes cannot be negative.');
  }
  const horizontal = Math.ceil(Math.max(0, MIN_TOUCH_TARGET - size.width) / 2);
  const vertical = Math.ceil(Math.max(0, MIN_TOUCH_TARGET - size.height) / 2);
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}
