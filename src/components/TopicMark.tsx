import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '../theme';
import type { TopicColorKey } from './Chip';

/**
 * A topic's icon drawn in its topic color (docs/01 §3 and §5), for list rows, chips, and the
 * focus and completion screens. Decorative: the topic's name is always shown beside it and is
 * what screen readers read (docs/11: color plus icon plus name, never color alone).
 *
 * PLACEHOLDER: the curated topic icon set (~40–60 line icons) is not chosen yet, so every
 * identifier draws the same line glyph. The identifier is kept (`testID`), so the real icons
 * can replace it without changing callers. An unknown identifier or color never fails.
 */
export const topicMarkStatus = 'placeholder' as const;

/** The theme key of an API topic color (`topic.1`–`topic.12`), or null for anything else. */
export function topicColorKey(color: string): TopicColorKey | null {
  const match = /^topic\.([1-9]|1[0-2])$/.exec(color);
  return match ? (Number(match[1]) as TopicColorKey) : null;
}

export interface TopicMarkProps {
  /** The API color identifier, such as `topic.3`. */
  color: string;
  /** The API icon identifier, such as `book`. */
  icon: string;
  /** Icon token size (default `md`, the list icon size). */
  size?: 'sm' | 'md' | 'lg';
}

export function TopicMark({ color, icon, size = 'md' }: TopicMarkProps) {
  const theme = useTheme();
  const key = topicColorKey(color);
  const line = {
    stroke: key === null ? theme.colors.text.secondary : theme.colors.topic[key],
    strokeWidth: theme.lineIcon.strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  const pixels = theme.icon[size];
  return (
    <View
      testID={`topic-mark-${icon}`}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Svg width={pixels} height={pixels} viewBox="0 0 24 24">
        {/* A seed in a ring: the same placeholder for every topic icon. */}
        <Circle cx={12} cy={12} r={9} {...line} />
        <Path d="M12 16 C9 14 9 10 12 7 C15 10 15 14 12 16 Z" {...line} />
      </Svg>
    </View>
  );
}
