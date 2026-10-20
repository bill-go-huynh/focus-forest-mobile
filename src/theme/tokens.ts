import type { TextStyle } from 'react-native';

import type { FontFamily } from './fonts';

/** 4-point spacing scale (docs/01_DESIGN_SYSTEM.md §2 → Spacing). */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = { sm: 8, md: 12, lg: 20, xl: 28, full: 9999 } as const;

export const icon = { sm: 16, md: 24, lg: 32 } as const;

/** Line icons: rounded, medium stroke (docs/01 §5: about 1.75–2 at 24). PROVISIONAL. */
export const lineIcon = { strokeWidth: 2 } as const;

export const opacity = { disabled: 0.4, muted: 0.64, scrim: 0.4 } as const;

/**
 * Control sizes (docs/01_DESIGN_SYSTEM.md §8). minHeight: the primary button and input
 * minimum (52). borderWidth: the outline on selected chips and input fields, kept
 * constant across states so a state change never shifts the layout.
 */
export const control = { minHeight: 52, borderWidth: 2 } as const;

/**
 * Progress ring geometry (docs/01 §8 → Progress indicators: a soft ring, rounded caps).
 * PROVISIONAL starting values, like the type sizes.
 */
export const progressRing = {
  size: 72,
  strokeWidth: 8,
  /** The Focus dial: the session ring around this month's tree (docs/01 §8 → Timer progress). */
  dial: { size: 264, strokeWidth: 10, inset: 14 },
} as const;

/**
 * Achievement progress (docs/01 §8: a slim linear bar plus a fraction). PROVISIONAL, like the
 * progress ring.
 */
export const progressBar = { height: 6 } as const;

/**
 * Badge art sizes (docs/10 → Badges: readable at ~48px): `mark` in lists and the showcase,
 * `reveal` for the unlock moment. PROVISIONAL, like the placeholder badge art.
 */
export const badge = { mark: 48, reveal: 96 } as const;

/**
 * The tree scene (docs/03): its aspect ratio (width / height, the art's 240 × 288 view box) and
 * the forest-thumbnail width. PROVISIONAL, like the placeholder art.
 */
export const treeScene = { aspectRatio: 5 / 6, thumbnail: 96 } as const;

/** Spot illustrations for empty and error states: small and calm (docs/01 §9). PROVISIONAL. */
export const illustration = { spot: 120 } as const;

/** Avatar sizes. `lg` is the profile header avatar. */
export const avatar = { lg: 72 } as const;

/** Pressed state: a slight tonal shift and scale (docs/01 §8, docs/04 §2). */
export const interaction = { pressedScale: 0.97 } as const;

export interface ElevationToken {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  /** Android elevation. */
  elevation: number;
}

export type ElevationTokens = Record<0 | 1 | 2 | 3, ElevationToken>;

/** Few, soft, warm-tinted shadows. In dark mode depth comes mainly from surface tone. */
export function elevationFor(shadowColor: string, strength: number): ElevationTokens {
  const level = (height: number, blur: number, alpha: number, android: number) => ({
    shadowColor,
    shadowOffset: { width: 0, height },
    shadowOpacity: alpha * strength,
    shadowRadius: blur,
    elevation: android,
  });
  return {
    0: level(0, 0, 0, 0),
    1: level(1, 3, 0.08, 1),
    2: level(3, 8, 0.1, 3),
    3: level(6, 16, 0.14, 6),
  };
}

/**
 * Semantic type scale (docs/01_DESIGN_SYSTEM.md §3). Fraunces sets display text only; Inter
 * sets everything else (owner decision 2026-10-16; faces in `fonts.ts`). Each token names the
 * face of its weight. PROVISIONAL: the sizes are starting values. All text must still scale
 * with the system font size.
 */
type TypeToken = Required<Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight'>> &
  Pick<TextStyle, 'fontVariant' | 'letterSpacing'> & { fontFamily: FontFamily };

export const type = {
  display: { fontFamily: 'Fraunces-Regular', fontSize: 34, lineHeight: 42, fontWeight: '400' },
  timer: {
    fontFamily: 'Inter-Light',
    fontSize: 72,
    lineHeight: 84,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  title: { fontFamily: 'Inter-SemiBold', fontSize: 24, lineHeight: 32, fontWeight: '600' },
  headline: { fontFamily: 'Inter-SemiBold', fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontFamily: 'Inter-Regular', fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontFamily: 'Inter-Medium', fontSize: 16, lineHeight: 24, fontWeight: '500' },
  label: { fontFamily: 'Inter-Medium', fontSize: 15, lineHeight: 20, fontWeight: '500' },
  caption: { fontFamily: 'Inter-Regular', fontSize: 13, lineHeight: 18, fontWeight: '400' },
  stat: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
} as const satisfies Record<string, TypeToken>;

/**
 * Durations in milliseconds (docs/04_ANIMATION_SYSTEM.md §2). `ambient` holds the tree's idle
 * cycles (docs/04 §5): the canopy sway (6–10 s), the foliage's own sway (3–6 s), and the
 * particle drift.
 */
export const motion = {
  fast: 150,
  base: 300,
  progress: 600,
  reward: 1200,
  growth: 1800,
  ambient: { sway: 8000, foliage: 4500, drift: 6000 },
} as const;

/**
 * Cubic-bézier control points [x1, y1, x2, y2].
 * PROVISIONAL: docs/04 says the exact curves are set in Phase 1; these are starting values.
 */
export const easing = {
  standard: [0.2, 0, 0, 1],
  enter: [0, 0, 0, 1],
  exit: [0.3, 0, 1, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** Well-damped spring with minimal overshoot. PROVISIONAL, like the easing curves. */
export const spring = {
  gentle: { damping: 26, stiffness: 180, mass: 1 },
} as const;
