import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useTheme } from '../theme';

/**
 * Tab icons (docs/01 §5 and §8 → Bottom navigation): rounded line icons, and the filled
 * form for the active tab.
 *
 * PLACEHOLDER: Phase 0 has not chosen the icon family. These four are drawn in the
 * documented line style so the tab bar can ship; replace them with the chosen family.
 */
export const TAB_ICON_NAMES = ['index', 'forest', 'together', 'insights', 'profile'] as const;
export type TabIconName = (typeof TAB_ICON_NAMES)[number];
export const tabIconStatus = 'placeholder' as const;

interface TabIconProps {
  name: TabIconName;
  filled: boolean;
  color: string;
  size: number;
}

// Drawn on a 24-unit grid and scaled to `size`.
function shapes(name: TabIconName, paint: { fill: string; stroke: string; strokeWidth: number }) {
  const line = { ...paint, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'index':
      return <Path d="M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4 Z" {...line} />;
    case 'forest':
      return (
        <>
          <Circle cx={12} cy={9} r={6} {...line} />
          <Path d="M12 15 V21" {...line} fill="none" />
        </>
      );
    case 'together':
      // Two people side by side.
      return (
        <>
          <Circle cx={8.5} cy={8.5} r={3} {...line} />
          <Circle cx={15.5} cy={8.5} r={3} {...line} />
          <Path d="M3 19 C3 15.5 5.5 14 8.5 14 C11.5 14 14 15.5 14 19 Z" {...line} />
          <Path d="M10 19 C10 15.5 12.5 14 15.5 14 C18.5 14 21 15.5 21 19 Z" {...line} />
        </>
      );
    case 'insights':
      return (
        <>
          <Rect x={4} y={12} width={4} height={8} rx={1.5} {...line} />
          <Rect x={10} y={6} width={4} height={14} rx={1.5} {...line} />
          <Rect x={16} y={9} width={4} height={11} rx={1.5} {...line} />
        </>
      );
    case 'profile':
      return (
        <>
          <Circle cx={12} cy={8} r={4} {...line} />
          <Path d="M4 20 C4 15.5 8 13.5 12 13.5 C16 13.5 20 15.5 20 20 Z" {...line} />
        </>
      );
  }
}

export function TabIcon({ name, filled, color, size }: TabIconProps) {
  const theme = useTheme();
  const variant = filled ? 'filled' : 'line';
  return (
    // Decorative: the tab's label names it.
    <View
      testID={`tab-icon-${name}-${variant}`}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {shapes(name, {
          fill: filled ? color : 'none',
          stroke: color,
          strokeWidth: theme.lineIcon.strokeWidth,
        })}
      </Svg>
    </View>
  );
}
