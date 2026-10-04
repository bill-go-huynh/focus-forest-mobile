import type { TreeComposition } from './composition';
import {
  LIGHTING_PRESETS,
  SIGNATURE_PALETTE,
  TIMES_OF_DAY,
  type LightingPreset,
  type TimeOfDay,
} from './signature/palette';
import type { Decoration } from './signature/stages';
import { VITALITY_STATES } from './tree-contract';
import type { Ambience } from './visual-state';

/**
 * The scene around the tree: ambient energy from vitality, and lighting from the device's local
 * time (docs/03 §6, §10). Presentation only: none of it is sent to or stored by the server, and
 * none of it changes what the tree has earned. The season is never inferred from the month.
 */

export { TIMES_OF_DAY, type Ambience, type TimeOfDay };

export const AMBIENCES: readonly Ambience[] = [...VITALITY_STATES, 'at_rest'];

/** How alive the scene feels. Vitality may change only these (docs/03 §6). */
export interface AmbientParams {
  /** Idle motion energy, 0 (still) to 1. */
  sway: number;
  /** Pollen motes in daylight. */
  pollen: number;
  /** Warmth of the scene light, 0 to 1. */
  warmth: number;
  /** Foliage saturation, kept between 0.9 and 1. */
  saturation: number;
}

const AMBIENT: Record<Ambience, AmbientParams> = {
  thriving: { sway: 1, pollen: 6, warmth: 1, saturation: 1 },
  healthy: { sway: 0.75, pollen: 4, warmth: 0.8, saturation: 1 },
  // Waking up: a noticeably warm response after a gap (docs/03 §6 → Recovery).
  recovering: { sway: 0.7, pollen: 3, warmth: 0.9, saturation: 1 },
  stable: { sway: 0.5, pollen: 2, warmth: 0.6, saturation: 0.97 },
  // Calm, still, dusk-like light: resting, still beautiful.
  quiet: { sway: 0.15, pollen: 0, warmth: 0.35, saturation: 0.94 },
  // An archived tree: neutral and peaceful, gently alive (docs/03 §11).
  at_rest: { sway: 0.4, pollen: 1, warmth: 0.6, saturation: 1 },
};

export function ambientFor(ambience: Ambience): AmbientParams {
  return AMBIENT[ambience];
}

/** The lighting preset for a local clock time on this device. */
export function timeOfDayAt(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'golden_hour';
  if (hour >= 19 && hour < 21) return 'dusk';
  return 'night';
}

export function sceneLighting(timeOfDay: TimeOfDay): LightingPreset {
  return LIGHTING_PRESETS[timeOfDay];
}

export interface SceneColors {
  bark: string;
  roots: string;
  soil: string;
  seed: string;
  foliage: { back: string; main: string; front: string; accent: string; highlight: string };
  blossom: string;
  blossomCenter: string;
  fruit: string;
  fruitCap: string;
  glow: { color: string; opacity: number };
  pollen: string;
  firefly: string;
  decorations: Record<Decoration, string>;
  light: { color: string; opacity: number };
}

/**
 * The tree's colors under this light. Vitality moves only the foliage saturation (a little,
 * toward a calm blue-green) and the warmth of the scene light; earned elements keep their color.
 */
export function sceneColors(
  composition: TreeComposition,
  ambient: AmbientParams,
  lighting: LightingPreset,
): SceneColors {
  const p = SIGNATURE_PALETTE;
  const tint = p.tints[composition.tint] ?? p.tints[0];
  const shade = (color: string) => mix(color, lighting.shade.color, lighting.shade.amount);
  const leaf = (color: string) => shade(mix(color, p.calm, 1 - ambient.saturation));
  return {
    bark: shade(p.bark),
    roots: shade(p.roots),
    soil: shade(p.soil),
    seed: shade(p.seed),
    foliage: {
      back: leaf(tint.back),
      main: leaf(tint.main),
      front: leaf(tint.front),
      accent: leaf(p.accent),
      highlight: leaf(p.highlight),
    },
    blossom: shade(p.blossom),
    blossomCenter: shade(p.blossomCenter),
    fruit: shade(p.fruit),
    fruitCap: shade(p.fruitCap),
    glow: { color: p.glow, opacity: lighting.glowOpacity },
    pollen: p.pollen,
    firefly: p.firefly,
    decorations: p.decorations,
    light: {
      color: lighting.light.color,
      opacity: lighting.light.opacity * (0.5 + 0.5 * ambient.warmth),
    },
  };
}

export interface Particle {
  key: string;
  kind: 'pollen' | 'firefly';
  x: number;
  y: number;
  r: number;
}

const FIREFLIES = 5;

/**
 * The one ambient particle layer (docs/03 §8): pollen by day, as many as vitality allows, and
 * fireflies at night on a tree at the top richness tier, whatever its vitality.
 */
export function particlesFor(
  composition: TreeComposition,
  ambient: AmbientParams,
  lighting: LightingPreset,
): Particle[] {
  const slots = composition.particleSlots;
  if (lighting.daylight) {
    return slots
      .slice(0, ambient.pollen)
      .map((slot, i) => ({ key: `pollen-${i}`, kind: 'pollen', x: slot.x, y: slot.y, r: 1.6 }));
  }
  if (lighting.night && composition.fireflies) {
    return slots
      .slice(0, FIREFLIES)
      .map((slot, i) => ({ key: `firefly-${i}`, kind: 'firefly', x: slot.x, y: slot.y, r: 2 }));
  }
  return [];
}

/** Mixes two #rrggbb colors: `amount` 0 gives `from`, 1 gives `to`. */
export function mix(from: string, to: string, amount: number): string {
  if (amount <= 0) return from;
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const value = [0, 1, 2].map((i) =>
    Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * Math.min(1, amount)),
  );
  return `#${value.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
