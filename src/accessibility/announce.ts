import { AccessibilityInfo } from 'react-native';

/**
 * Announces an outcome to screen readers and returns the same text for the visible
 * caption. Use it whenever motion or a haptic signals something, so the meaning is
 * also available as text (docs/11_ACCESSIBILITY.md, docs/04_ANIMATION_SYSTEM.md §8).
 */
export function announce(message: string): string {
  if (message.trim() === '') {
    throw new Error('announce() needs text: the text carries the meaning, not the motion.');
  }
  AccessibilityInfo.announceForAccessibility(message);
  return message;
}
