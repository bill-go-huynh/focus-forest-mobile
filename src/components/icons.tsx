import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../theme';

/**
 * Tab icons (docs/01 §5 and §8 → Bottom navigation): rounded line icons, and the filled
 * form for the active tab. Nature motifs where they fit: the Forest tab is two trees.
 *
 * PROVISIONAL (ART.3, 2026-10-16): drawn in the documented line style, as on the art
 * direction canvas; final when the owner passes them through the art quality gate (docs/10 §4).
 */
export const TAB_ICON_NAMES = ['index', 'forest', 'together', 'insights', 'profile'] as const;
export type TabIconName = (typeof TAB_ICON_NAMES)[number];
export const tabIconStatus = 'provisional' as const;

interface TabIconProps {
  name: TabIconName;
  filled: boolean;
  color: string;
  size: number;
}

/** On a 24-unit grid: `shapes` fill when the tab is active, `lines` never do. */
const ICONS: Record<TabIconName, { shapes: readonly string[]; lines: readonly string[] }> = {
  index: {
    shapes: ['M4 11 L12 4.5 L20 11 V19.5 H4 Z'],
    lines: ['M10 19.5 V15 C10 13.9 10.9 13 12 13 C13.1 13 14 13.9 14 15 V19.5'],
  },
  forest: {
    shapes: [
      'M8.5 4 C11.5 4 13 6.5 13 9 C13 11.6 11 13 8.5 13 C6 13 4 11.6 4 9 C4 6.5 5.5 4 8.5 4 Z',
      'M16.5 7.5 C18.8 7.5 20 9.5 20 11.5 C20 13.6 18.4 15 16.5 15 C14.6 15 13.2 13.9 13 12.2',
    ],
    lines: ['M8.5 13 V20', 'M16.5 15 V20', 'M3 20 H21'],
  },
  together: {
    shapes: [
      'M8.5 5.5 A3 3 0 1 1 8.49 5.5 Z',
      'M3 19 C3 15.5 5.5 14 8.5 14 C11.5 14 14 15.5 14 19 Z',
      'M15.5 5.5 A3 3 0 1 1 15.49 5.5 Z',
    ],
    lines: ['M15.5 14 C18.5 14 21 15.5 21 19 H16.5'],
  },
  insights: {
    shapes: [
      'M5.5 12 H6.5 C7.3 12 8 12.7 8 13.5 V20 H4 V13.5 C4 12.7 4.7 12 5.5 12 Z',
      'M11.5 6 H12.5 C13.3 6 14 6.7 14 7.5 V20 H10 V7.5 C10 6.7 10.7 6 11.5 6 Z',
      'M17.5 9 H18.5 C19.3 9 20 9.7 20 10.5 V20 H16 V10.5 C16 9.7 16.7 9 17.5 9 Z',
    ],
    lines: [],
  },
  profile: {
    shapes: ['M12 4 A4 4 0 1 1 11.99 4 Z', 'M4 20 C4 15.5 8 13.5 12 13.5 C16 13.5 20 15.5 20 20 Z'],
    lines: [],
  },
};

export function TabIcon({ name, filled, color, size }: TabIconProps) {
  const theme = useTheme();
  const variant = filled ? 'filled' : 'line';
  const stroke = {
    stroke: color,
    strokeWidth: theme.lineIcon.strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const { shapes, lines } = ICONS[name];
  return (
    // Decorative: the tab's label names it.
    <View
      testID={`tab-icon-${name}-${variant}`}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {shapes.map((d) => (
          <Path key={d} d={d} fill={filled ? color : 'none'} {...stroke} />
        ))}
        {lines.map((d) => (
          <Path key={d} d={d} fill="none" {...stroke} />
        ))}
      </Svg>
    </View>
  );
}
