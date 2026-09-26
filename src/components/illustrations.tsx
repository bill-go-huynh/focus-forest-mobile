import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { useTheme, type Theme } from '../theme';

/**
 * Spot illustrations for empty, onboarding, and error states (docs/10 §2 → UI
 * illustrations: a seed in soil, a clearing, a lantern).
 *
 * PLACEHOLDERS (docs/10 §4, stage 1): simple geometric stand-ins drawn with theme colors.
 * They are not final art. Production art replaces the drawing behind the same
 * identifiers, so callers do not change.
 */

export const ILLUSTRATION_IDS = ['seed-in-soil', 'clearing', 'lantern'] as const;
export type IllustrationId = (typeof ILLUSTRATION_IDS)[number];

export const illustrationStatus: Record<IllustrationId, 'placeholder' | 'final'> = {
  'seed-in-soil': 'placeholder',
  clearing: 'placeholder',
  lantern: 'placeholder',
};

type Draw = (colors: Theme['colors'], s: number) => React.ReactNode;

// Geometry is in fractions of the size `s`, so every shape scales with it.
const drawings: Record<IllustrationId, Draw> = {
  'seed-in-soil': (c, s) => (
    <>
      <Ellipse cx={s / 2} cy={s * 0.78} rx={s * 0.42} ry={s * 0.14} fill={c.forest.soft} />
      <Ellipse cx={s / 2} cy={s * 0.7} rx={s * 0.1} ry={s * 0.07} fill={c.accent.primary} />
      <Path
        d={`M ${s / 2} ${s * 0.64} Q ${s * 0.46} ${s * 0.5} ${s * 0.56} ${s * 0.42}`}
        stroke={c.forest.primary}
        strokeWidth={s * 0.03}
        strokeLinecap="round"
        fill="none"
      />
      <Ellipse cx={s * 0.6} cy={s * 0.42} rx={s * 0.07} ry={s * 0.04} fill={c.forest.primary} />
    </>
  ),
  clearing: (c, s) => (
    <>
      <Circle cx={s * 0.68} cy={s * 0.3} r={s * 0.12} fill={c.glow} />
      <Ellipse cx={s / 2} cy={s * 0.76} rx={s * 0.46} ry={s * 0.16} fill={c.forest.soft} />
      <Ellipse cx={s * 0.32} cy={s * 0.72} rx={s * 0.08} ry={s * 0.03} fill={c.forest.primary} />
    </>
  ),
  lantern: (c, s) => (
    <>
      <Circle cx={s / 2} cy={s * 0.52} r={s * 0.34} fill={c.glow} />
      <Rect
        x={s * 0.38}
        y={s * 0.36}
        width={s * 0.24}
        height={s * 0.34}
        rx={s * 0.06}
        fill={c.accent.primary}
      />
      <Rect x={s * 0.44} y={s * 0.28} width={s * 0.12} height={s * 0.08} fill={c.forest.deep} />
      <Ellipse cx={s / 2} cy={s * 0.84} rx={s * 0.3} ry={s * 0.06} fill={c.forest.soft} />
    </>
  ),
};

export function SpotIllustration({ id, size }: { id: IllustrationId; size?: number }) {
  const theme = useTheme();
  const s = size ?? theme.illustration.spot;
  return (
    // Decorative: the sentence beside it carries the meaning.
    <View
      testID={`illustration-${id}`}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: s, height: s }}
    >
      <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
        {drawings[id](theme.colors, s)}
      </Svg>
    </View>
  );
}
