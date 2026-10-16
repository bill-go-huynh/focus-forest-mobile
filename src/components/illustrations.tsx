import { useId } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import { useTheme, type Theme } from '../theme';

/**
 * Spot illustrations for empty, onboarding, and error states (docs/10 §2 → UI
 * illustrations: a seed in soil, a clearing, a lantern).
 *
 * PROVISIONAL (ART.4, 2026-10-16): small scenes of the tree's world in direction B,
 * painterly-flat: soft gradients lit from the upper left, drawn only with theme colors so they
 * belong to the day garden and the night garden alike. Final when the owner passes them through
 * the art quality gate (docs/10 §4). Callers use the same identifiers.
 */

export const ILLUSTRATION_IDS = ['seed-in-soil', 'clearing', 'lantern'] as const;
export type IllustrationId = (typeof ILLUSTRATION_IDS)[number];

export const illustrationStatus: Record<IllustrationId, 'placeholder' | 'provisional' | 'final'> = {
  'seed-in-soil': 'provisional',
  clearing: 'provisional',
  lantern: 'provisional',
};

type Draw = (
  colors: Theme['colors'],
  ref: (name: string) => string,
  id: (name: string) => string,
) => React.ReactNode;

/** Soft light: a glow that fades out from its center. */
function Glow({ id, color }: { id: string; color: string }) {
  return (
    <RadialGradient id={id} cx="50%" cy="50%" r="50%">
      <Stop offset="0" stopColor={color} stopOpacity={1} />
      <Stop offset="1" stopColor={color} stopOpacity={0} />
    </RadialGradient>
  );
}

/** A ground mound lit from the upper left. */
function Ground({ id, light, dark }: { id: string; light: string; dark: string }) {
  return (
    <LinearGradient id={id} x1="0.2" y1="0" x2="0.8" y2="1">
      <Stop offset="0" stopColor={light} />
      <Stop offset="1" stopColor={dark} />
    </LinearGradient>
  );
}

// Drawn in a 96-unit box and scaled to the size asked for.
const drawings: Record<IllustrationId, Draw> = {
  'seed-in-soil': (c, ref, id) => (
    <>
      <Defs>
        <Glow id={id('halo')} color={c.glow} />
        <Ground id={id('soil')} light={c.forest.soft} dark={c.background.secondary} />
        <RadialGradient id={id('seed')} cx="34%" cy="30%" r="80%">
          <Stop offset="0" stopColor={c.accent.soft} />
          <Stop offset="1" stopColor={c.accent.primary} />
        </RadialGradient>
      </Defs>
      <Circle cx={52} cy={44} r={34} fill={ref('halo')} />
      <Path d="M8 78 C22 62 74 62 88 78 C70 86 26 86 8 78 Z" fill={ref('soil')} />
      <Ellipse cx={48} cy={70} rx={8} ry={6} fill={ref('seed')} rotation={-18} origin="48, 70" />
      <Path
        d="M49 64 C48 56 49 50 53 44"
        stroke={c.forest.primary}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
      <Path d="M53 46 C53 39 58 35 65 35 C65 42 60 46 53 46 Z" fill={c.forest.primary} />
      <Path d="M51 50 C47 46 41 46 37 49 C41 53 47 53 51 50 Z" fill={c.forest.primary} />
    </>
  ),
  clearing: (c, ref, id) => (
    <>
      <Defs>
        <Glow id={id('sun')} color={c.glow} />
        <Ground id={id('far')} light={c.forest.soft} dark={c.background.secondary} />
        <Ground id={id('near')} light={c.forest.soft} dark={c.surface.sunken} />
      </Defs>
      <Circle cx={64} cy={30} r={26} fill={ref('sun')} />
      <Circle cx={64} cy={30} r={9} fill={c.glow} />
      <Path
        d="M6 66 C20 56 40 56 52 60 C64 63 78 57 90 62 C93 70 84 78 48 80 C14 80 3 73 6 66 Z"
        fill={ref('far')}
      />
      <Path d="M10 77 C26 69 70 69 86 77 C72 85 24 85 10 77 Z" fill={ref('near')} />
      {/* Two young trees at the edge of the clearing. */}
      <Path d="M20 70 V58" stroke={c.border.default} strokeWidth={2} strokeLinecap="round" />
      <Path
        d="M20 44 C26 44 29 49 29 53 C29 57 25 60 20 60 C15 60 11 57 11 53 C11 49 14 44 20 44 Z"
        fill={c.forest.primary}
      />
      <Path d="M80 70 V62" stroke={c.border.default} strokeWidth={2} strokeLinecap="round" />
      <Path
        d="M80 52 C84 52 86 55 86 58 C86 61 83 63 80 63 C77 63 74 61 74 58 C74 55 76 52 80 52 Z"
        fill={c.forest.primary}
      />
      <Path
        d="M44 78 q1 -4 3 -6 M52 79 q-1 -4 -3 -6"
        stroke={c.forest.primary}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
  lantern: (c, ref, id) => (
    <>
      <Defs>
        <Glow id={id('light')} color={c.glow} />
        <Ground id={id('ground')} light={c.forest.soft} dark={c.background.secondary} />
        <RadialGradient id={id('glass')} cx="40%" cy="35%" r="75%">
          <Stop offset="0" stopColor={c.glow} />
          <Stop offset="1" stopColor={c.accent.primary} />
        </RadialGradient>
      </Defs>
      <Circle cx={48} cy={48} r={36} fill={ref('light')} />
      <Path d="M14 82 C28 74 68 74 82 82 C66 88 30 88 14 82 Z" fill={ref('ground')} />
      <Path d="M48 18 V26" stroke={c.border.default} strokeWidth={2} strokeLinecap="round" />
      <Path d="M38 32 L48 25 L58 32 Z" fill={c.border.default} />
      <Path
        d="M39 33 H57 C59 33 60 34 60 36 V58 C60 60 59 61 57 61 H39 C37 61 36 60 36 58 V36 C36 34 37 33 39 33 Z"
        fill={ref('glass')}
      />
      <Path d="M48 36 V58" stroke={c.border.default} strokeWidth={1.4} opacity={0.5} />
      <Path d="M38 62 H58 L56 68 H40 Z" fill={c.border.default} />
    </>
  ),
};

export function SpotIllustration({ id, size }: { id: IllustrationId; size?: number }) {
  const theme = useTheme();
  const s = size ?? theme.illustration.spot;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradientId = (name: string) => `illus-${uid}-${name}`;
  const ref = (name: string) => `url(#${gradientId(name)})`;
  return (
    // Decorative: the sentence beside it carries the meaning.
    <View
      testID={`illustration-${id}`}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: s, height: s }}
    >
      <Svg width={s} height={s} viewBox="0 0 96 96">
        {drawings[id](theme.colors, ref, gradientId)}
      </Svg>
    </View>
  );
}
