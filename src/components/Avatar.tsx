import { View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { useTheme } from '../theme';

/**
 * The profile avatar. Until avatar upload exists (docs/08 §5) it shows the display name's
 * initials, or a small seed when there is no name yet. It is drawn as a graphic so the
 * letters stay inside the circle at any text size; the name beside it is the text.
 */
export function Avatar({ initials }: { initials: string | null }) {
  const theme = useTheme();
  const size = theme.avatar.lg;
  const c = size / 2;
  return (
    <View
      testID="avatar"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={c} cy={c} r={c} fill={theme.colors.accent.soft} />
        {initials ? (
          <SvgText
            x={c}
            y={c}
            fill={theme.colors.text.accent}
            fontSize={theme.type.title.fontSize}
            fontWeight={theme.type.title.fontWeight}
            textAnchor="middle"
            alignmentBaseline="central"
          >
            {initials}
          </SvgText>
        ) : (
          <Path
            testID="avatar-seed"
            d={`M ${c} ${c - size * 0.2} C ${c + size * 0.16} ${c - size * 0.04} ${c + size * 0.1} ${c + size * 0.18} ${c} ${c + size * 0.2} C ${c - size * 0.1} ${c + size * 0.18} ${c - size * 0.16} ${c - size * 0.04} ${c} ${c - size * 0.2} Z`}
            fill={theme.colors.forest.primary}
          />
        )}
      </Svg>
    </View>
  );
}
