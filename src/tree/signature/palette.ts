import type { Decoration } from './stages';

/**
 * Scene and species palettes (docs/01 §2: tree and scene art use their own palettes, not UI
 * tokens; docs/10 §2: species palette and base-environment lighting presets). This is the only
 * file in the renderer with raw colors. PROVISIONAL (ART.1, 2026-10-16): the scene follows the
 * art direction canvas, direction B (painterly-flat), chosen by the owner; it becomes final when
 * the owner passes the art quality gate on a device (docs/10 §4).
 *
 * Rules the values keep: foliage stays green in every tint, light, and vitality (never brown,
 * grey, or wilted, docs/03 §6); depth comes from value (back foliage lighter, hazier and less
 * saturated, front foliage deeper, docs/03 §7); the key light comes from the upper left; night is a deep blue-green,
 * never black (docs/01 §10).
 */

export const TIMES_OF_DAY = ['dawn', 'day', 'golden_hour', 'dusk', 'night'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export interface FoliageTint {
  back: string;
  main: string;
  front: string;
}

export const SIGNATURE_PALETTE = {
  bark: '#6B4F3A',
  roots: '#5E4532',
  soil: '#8A6E52',
  seed: '#9C7651',
  /** Three authored foliage tints; the variation seed picks one. */
  tints: [
    { back: '#79AB6E', main: '#7AAD5F', front: '#4E8346' },
    { back: '#73A878', main: '#73A96A', front: '#4A8052' },
    { back: '#7EAD66', main: '#80B05A', front: '#538545' },
  ] as const satisfies readonly FoliageTint[],
  /** The Blooming Tree's bloom expression: warm, sunlit leaves (not flowers). */
  accent: '#A9BF5A',
  /** Sun-touched leaf edges (richness tier 3). */
  highlight: '#B8D98A',
  blossom: '#F4D3DC',
  blossomCenter: '#E9B949',
  fruit: '#9A6B3C',
  fruitCap: '#6E5236',
  glow: '#FFE9A8',
  pollen: '#FFF3C4',
  firefly: '#F8F1A0',
  /** What lower saturation blends toward: a calm blue-green, never grey or brown. */
  calm: '#7E9C93',
  /** Ground shadow under the canopy. */
  shadow: '#2F3B2A',
  /**
   * A cluster's volume (ART.1): lighter and a touch warmer on the upper left, darker and a
   * touch cooler on the lower right, saturation kept (`brush.ts`).
   */
  volume: { light: { lightness: 0.14, hue: -8 }, dark: { lightness: -0.15, hue: 6 } },
  /** Bark lit from the left, shaded on the right. */
  barkVolume: { light: { lightness: 0.08, hue: 0 }, dark: { lightness: -0.1, hue: 0 } },
  /** How opaque the art's soft layers are; `grain` is the hero scene's paper texture. */
  opacity: { highlight: 0.55, shadow: 0.16, hills: 0.85, lantern: 0.35, grain: 0.45 },
  decorations: {
    'hanging-bloom': '#F2C1CF',
    'songbird-nest': '#8B6A4A',
    'vine-ribbon': '#7FAF6A',
    'lantern-flower': '#F6C76B',
    seedpod: '#B49461',
    'heartwood-ring': '#C9A27A',
    'golden-leaf': '#E8C25A',
    'event-ribbon': '#C96F5B',
  } as const satisfies Record<Decoration, string>,
} as const;

export interface LightingPreset {
  /** Sky gradient, top to horizon. */
  sky: readonly [string, string];
  hills: string;
  ground: string;
  celestial: { kind: 'sun' | 'moon'; x: number; y: number; r: number; color: string };
  /** A tint over the whole scene (docs/03 §7 layer 19). */
  light: { color: string; opacity: number };
  /** How far the tree's colors move toward the scene's shade. */
  shade: { color: string; amount: number };
  glowOpacity: number;
  /** Pollen drifts in daylight. */
  daylight: boolean;
  /** Fireflies show at night on the richest trees. */
  night: boolean;
  /** Warm light gathered on the ground under the tree (docs/03 §7 layer 4). */
  pool: { color: string; opacity: number };
  /** Haze at the horizon, so the far land recedes and the tree reads first (docs/01 §6). */
  mist: { color: string; opacity: number };
}

export const LIGHTING_PRESETS: Record<TimeOfDay, LightingPreset> = {
  dawn: {
    sky: ['#E9CDBF', '#F8EBD9'],
    hills: '#B7C4AE',
    ground: '#98AE80',
    celestial: { kind: 'sun', x: 52, y: 92, r: 15, color: '#FFE3B8' },
    light: { color: '#FFD9B0', opacity: 0.08 },
    shade: { color: '#3E5A6B', amount: 0.08 },
    glowOpacity: 0.2,
    daylight: true,
    night: false,
    pool: { color: '#FFE6C2', opacity: 0.45 },
    mist: { color: '#F8EBD9', opacity: 0.5 },
  },
  day: {
    sky: ['#BFD9DE', '#F2E8CF'],
    hills: '#AFC2A6',
    ground: '#9DB27F',
    celestial: { kind: 'sun', x: 58, y: 54, r: 16, color: '#FFF6DA' },
    light: { color: '#FFF4D6', opacity: 0.04 },
    shade: { color: '#3E5A6B', amount: 0 },
    glowOpacity: 0.16,
    daylight: true,
    night: false,
    pool: { color: '#FFF1C4', opacity: 0.55 },
    mist: { color: '#F2E8CF', opacity: 0.55 },
  },
  golden_hour: {
    sky: ['#E2A97F', '#F8DFB2'],
    hills: '#C4A684',
    ground: '#ADA56C',
    celestial: { kind: 'sun', x: 46, y: 104, r: 17, color: '#FFE3A3' },
    light: { color: '#FFB866', opacity: 0.1 },
    shade: { color: '#4F6B4A', amount: 0.05 },
    glowOpacity: 0.3,
    daylight: true,
    night: false,
    pool: { color: '#FFD98F', opacity: 0.7 },
    mist: { color: '#F8DFB2', opacity: 0.55 },
  },
  dusk: {
    sky: ['#7F8AA8', '#E6C2AE'],
    hills: '#7C8A93',
    ground: '#6C846C',
    celestial: { kind: 'sun', x: 40, y: 140, r: 14, color: '#F7B98F' },
    light: { color: '#F2B38F', opacity: 0.1 },
    shade: { color: '#2E3F5C', amount: 0.22 },
    glowOpacity: 0.32,
    daylight: false,
    night: false,
    pool: { color: '#F7C9A0', opacity: 0.35 },
    mist: { color: '#C9B4B4', opacity: 0.4 },
  },
  night: {
    sky: ['#0E1B22', '#21373A'],
    hills: '#18302A',
    ground: '#1F3A2E',
    celestial: { kind: 'moon', x: 182, y: 58, r: 12, color: '#E8EDD8' },
    light: { color: '#0B2030', opacity: 0.1 },
    shade: { color: '#10262A', amount: 0.4 },
    glowOpacity: 0.36,
    daylight: false,
    night: true,
    pool: { color: '#F5E3A8', opacity: 0.14 },
    mist: { color: '#2A4443', opacity: 0.5 },
  },
};
