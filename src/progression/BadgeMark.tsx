import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import type { Badge } from '../api/progression';
import { useTheme } from '../theme';
import { BADGE_VIEWBOX, badgeArt } from './badge-art';
import { BADGE_PALETTE } from './badge-palette';

/**
 * A badge's art (docs/10 → Badges: a frame per category, a central emblem, and a rarity
 * treatment, readable at ~48px), drawn from the badge the server sent (`badge-art.ts`).
 * Decorative: the badge's name is always shown beside it and is what screen readers read.
 *
 * PROVISIONAL (ART.2, 2026-10-16): direction B, painterly-flat, as on the art direction canvas;
 * final when the owner passes the badge set through the art quality gate (docs/10 §4). The
 * `artworkId` stays the `testID`; an unknown id, category, or rarity draws a plain badge.
 */
export const badgeArtStatus = 'provisional' as const;

/** The frame drawn inside the box, with room around it for a legendary glow. */
const PAD = 8;
const VIEWBOX = `${-PAD} ${-PAD} ${BADGE_VIEWBOX + 2 * PAD} ${BADGE_VIEWBOX + 2 * PAD}`;
const CENTER = BADGE_VIEWBOX / 2;

export function BadgeMark({
  badge,
  size = 'mark',
}: {
  badge: Pick<Badge, 'artworkId' | 'category' | 'rarity'>;
  size?: 'mark' | 'reveal';
}) {
  const theme = useTheme();
  const art = badgeArt(badge);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const groundId = `badge-ground-${uid}`;
  const haloId = `badge-halo-${uid}`;
  const pixels = theme.badge[size];
  const { edge, halo } = BADGE_PALETTE;
  return (
    <View
      testID={`badge-mark-${badge.artworkId}`}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Svg width={pixels} height={pixels} viewBox={VIEWBOX}>
        <Defs>
          <LinearGradient id={groundId} x1="0.2" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor={art.ground[0]} />
            <Stop offset="1" stopColor={art.ground[1]} />
          </LinearGradient>
          {art.halo ? (
            <RadialGradient id={haloId} cx="50%" cy="50%" r="50%">
              <Stop offset="0.55" stopColor={halo.color} stopOpacity={halo.opacity} />
              <Stop offset="1" stopColor={halo.color} stopOpacity={0} />
            </RadialGradient>
          ) : null}
        </Defs>
        {art.halo ? (
          <Circle
            testID="badge-halo"
            cx={CENTER}
            cy={CENTER}
            r={CENTER + PAD}
            fill={`url(#${haloId})`}
          />
        ) : null}
        <Path
          d={art.frame}
          fill={`url(#${groundId})`}
          stroke={art.ring.color}
          strokeWidth={art.ring.width}
          strokeLinejoin="round"
        />
        {/* A faint inner edge that catches the light. */}
        <Path
          d={art.frame}
          fill="none"
          stroke={edge.color}
          strokeOpacity={edge.opacity}
          strokeWidth={1}
          transform={`translate(${CENTER} ${CENTER}) scale(0.9) translate(${-CENTER} ${-CENTER})`}
        />
        {art.parts.map((part, i) => (
          <Path
            key={i}
            d={part.d}
            fill={part.fill}
            stroke={part.stroke}
            strokeWidth={part.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={part.opacity}
          />
        ))}
      </Svg>
    </View>
  );
}
