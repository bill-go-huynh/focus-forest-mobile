import type { Decoration } from './stages';

/**
 * Scene and species palettes (docs/01 §2: tree and scene art use their own palettes, not UI
 * tokens; docs/10 §2: species palette and base-environment lighting presets). This is the only
 * file in the renderer with raw colors. PLACEHOLDER values until the art direction sheet and the
 * master palette exist (docs/10 §3); production art replaces them here.
 *
 * Rules the values keep: foliage stays green in every tint, light, and vitality (never brown,
 * grey, or wilted, docs/03 §6); depth comes from value (back foliage darker and less
 * saturated, docs/03 §7); the key light comes from the upper left.
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
    { back: '#5E8F5A', main: '#6FA463', front: '#5A8F4E' },
    { back: '#5B8C62', main: '#6CA36E', front: '#568A5C' },
    { back: '#628F55', main: '#76A85E', front: '#5E9050' },
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
  /** How opaque the art's soft layers are. */
  opacity: { highlight: 0.55, shadow: 0.16, hills: 0.85, lantern: 0.35 },
  decorations: {
    'hanging-bloom': '#F2C1CF',
    'songbird-nest': '#8B6A4A',
    'vine-ribbon': '#7FAF6A',
    'lantern-flower': '#F6C76B',
    seedpod: '#B49461',
    'heartwood-ring': '#C9A27A',
    'golden-leaf': '#E8C25A',
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
}

export const LIGHTING_PRESETS: Record<TimeOfDay, LightingPreset> = {
  dawn: {
    sky: ['#F6D9C4', '#FBEFDF'],
    hills: '#B9C7B4',
    ground: '#9DB38A',
    celestial: { kind: 'sun', x: 52, y: 92, r: 15, color: '#FFE3B8' },
    light: { color: '#FFD9B0', opacity: 0.08 },
    shade: { color: '#3E5A6B', amount: 0.08 },
    glowOpacity: 0.2,
    daylight: true,
    night: false,
  },
  day: {
    sky: ['#CFE6EE', '#F4F1E4'],
    hills: '#B6CDB0',
    ground: '#9CBA86',
    celestial: { kind: 'sun', x: 58, y: 54, r: 16, color: '#FFF6DA' },
    light: { color: '#FFF4D6', opacity: 0.04 },
    shade: { color: '#3E5A6B', amount: 0 },
    glowOpacity: 0.16,
    daylight: true,
    night: false,
  },
  golden_hour: {
    sky: ['#F7CF9A', '#FBE9C9'],
    hills: '#C2C29A',
    ground: '#A8B67E',
    celestial: { kind: 'sun', x: 46, y: 104, r: 17, color: '#FFD58A' },
    light: { color: '#FFC97A', opacity: 0.12 },
    shade: { color: '#4F6B4A', amount: 0.05 },
    glowOpacity: 0.26,
    daylight: true,
    night: false,
  },
  dusk: {
    sky: ['#8E8DB5', '#E9C3B0'],
    hills: '#7E8B98',
    ground: '#6F8770',
    celestial: { kind: 'sun', x: 40, y: 140, r: 14, color: '#F7B98F' },
    light: { color: '#F2B38F', opacity: 0.1 },
    shade: { color: '#2E3F5C', amount: 0.22 },
    glowOpacity: 0.32,
    daylight: false,
    night: false,
  },
  night: {
    sky: ['#16243A', '#2E3F55'],
    hills: '#22324A',
    ground: '#2B3E3A',
    celestial: { kind: 'moon', x: 182, y: 58, r: 12, color: '#F1EBD3' },
    light: { color: '#9FB8E0', opacity: 0.08 },
    shade: { color: '#16243A', amount: 0.4 },
    glowOpacity: 0.36,
    daylight: false,
    night: true,
  },
};
