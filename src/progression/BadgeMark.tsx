import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import type { Badge } from '../api/progression';
import { useTheme } from '../theme';

/**
 * A badge's art (docs/10 → Badges: a frame per category, a central emblem, and a rarity
 * treatment, readable at ~48px), drawn from the badge the server sent. Decorative: the badge's
 * name is always shown beside it and is what screen readers read.
 *
 * PLACEHOLDER: the badge art set has not passed the art quality gate (docs/10), so every
 * `artworkId` draws the same leaf emblem; the frame follows the category and the rarity adds a
 * soft glow (rare) or a second ring (legendary), never confetti or gaudy materials. The id is
 * kept (`testID`) so the real art can replace it without changing callers; an unknown id,
 * category, or rarity draws the plain frame instead of failing.
 */
export const badgeArtStatus = 'placeholder' as const;

export function BadgeMark({
  badge,
  size = 'mark',
}: {
  badge: Pick<Badge, 'artworkId' | 'category' | 'rarity'>;
  size?: 'mark' | 'reveal';
}) {
  const theme = useTheme();
  const { colors } = theme;
  const frame =
    badge.category === 'focus'
      ? colors.forest.primary
      : badge.category === 'consistency'
        ? colors.accent.primary
        : colors.text.secondary;
  const line = {
    stroke: frame,
    strokeWidth: theme.lineIcon.strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const glow = badge.rarity === 'rare' || badge.rarity === 'legendary';
  const pixels = theme.badge[size];
  return (
    <View
      testID={`badge-mark-${badge.artworkId}`}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Svg width={pixels} height={pixels} viewBox="0 0 48 48">
        {glow ? <Circle cx={24} cy={24} r={23} fill={colors.glow} /> : null}
        <Circle cx={24} cy={24} r={18} fill={colors.surface.primary} {...line} />
        {badge.rarity === 'legendary' ? (
          <Circle cx={24} cy={24} r={21} fill="none" {...line} />
        ) : null}
        <Path d="M24 32 C18 28 18 20 24 14 C30 20 30 28 24 32 Z" fill="none" {...line} />
        <Path d="M24 32 L24 20" fill="none" {...line} />
      </Svg>
    </View>
  );
}
