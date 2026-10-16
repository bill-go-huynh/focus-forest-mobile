import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../theme';
import type { TopicColorKey } from './Chip';
import { topicIcon } from './topic-icons';

/**
 * A topic's icon drawn in its topic color (docs/01 §3 and §5), for list rows, chips, and the
 * focus and completion screens. Decorative: the topic's name is always shown beside it and is
 * what screen readers read (docs/11: color plus icon plus name, never color alone).
 *
 * PROVISIONAL (ART.3, 2026-10-16): the curated set (`topic-icons.ts`) drawn in the documented
 * line style; final when the owner passes it through the art quality gate (docs/10 §4). The
 * identifier is kept (`testID`). An unknown identifier draws the default seed, and an unknown
 * color the neutral text color: neither ever fails.
 */
export const topicMarkStatus = 'provisional' as const;

/** The theme key of an API topic color (`topic.1`–`topic.12`), or null for anything else. */
export function topicColorKey(color: string): TopicColorKey | null {
  const match = /^topic\.([1-9]|1[0-2])$/.exec(color);
  return match ? (Number(match[1]) as TopicColorKey) : null;
}

export interface TopicMarkProps {
  /** The API color identifier, such as `topic.3`; null for a topic nothing is known about. */
  color: string | null;
  /** The API icon identifier, such as `book`. */
  icon: string;
  /** Icon token size (default `md`, the list icon size). */
  size?: 'sm' | 'md' | 'lg';
}

export function TopicMark({ color, icon, size = 'md' }: TopicMarkProps) {
  const theme = useTheme();
  const key = color === null ? null : topicColorKey(color);
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
        {topicIcon(icon).paths.map((d) => (
          <Path key={d} d={d} {...line} />
        ))}
      </Svg>
    </View>
  );
}
