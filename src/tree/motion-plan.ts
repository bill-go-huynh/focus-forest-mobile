import type { Theme } from '../theme';
import type { AmbientParams } from './scene';
import type { TreeVisualState } from './visual-state';

/**
 * What the scene's animation should do, decided apart from the drawing so the rules are plain
 * (docs/04 §5, §6, §8). Calm and small: the canopy sways from near the trunk, the front foliage a
 * little more, particles drift; the trunk never bends, nothing bounces or breathes.
 */

/** `full` for Home and Tree Details, `calm` (canopy sway only) for the forest, `still`. */
export type SceneMotion = 'full' | 'calm' | 'still';

type MotionTokens = Theme['motion'];

export interface IdlePlan {
  canopyDegrees: number;
  canopyCycleMs: number;
  /**
   * Each foliage layer's own sway on top of the canopy's, phase-shifted by its own cycle:
   * the back least, the front most, for depth (docs/04 §5). 0 when a layer does not move alone.
   */
  backDegrees: number;
  backCycleMs: number;
  mainDegrees: number;
  mainCycleMs: number;
  frontDegrees: number;
  foliageCycleMs: number;
  /** In view-box units; 0 when particles stay put. Each particle drifts on its own phase. */
  driftDistance: number;
  driftCycleMs: number;
  /** How long a firefly takes to glow and soften again. */
  twinkleCycleMs: number;
  /** An occasional gentle gust through the canopy, or null for none. */
  gusts: { intervalsMs: readonly number[]; degrees: number } | null;
  /** A very slow drift of the scene's warmth, as a share of its light, or null for none. */
  light: { cycleMs: number; amount: number } | null;
}

/** The sway at full energy, in degrees, and the particle drift in view-box units. */
const CANOPY_DEGREES = 1.2;
const FRONT_DEGREES = 1.8;
const DRIFT = 4;
const BACK_DEGREES = 0.6;
const MAIN_DEGREES = 1;
const GUST_DEGREES = 1.6;
/** Gusts come every 15–40 s (docs/04 §5); a tree's own rhythm comes from its variation seed. */
const GUST_MIN_MS = 15_000;
const GUST_SPREAD_MS = 25_000;
const GUSTS = 6;
const LIGHT = { cycleMs: 40_000, amount: 0.25 } as const;
const TWINKLE_MS = 3600;

/** A tree's gust rhythm: deterministic from its seed, never Math.random. */
function gustIntervals(seed: number): number[] {
  let h = seed >>> 0 || 1;
  return Array.from({ length: GUSTS }, () => {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    return GUST_MIN_MS + (h % (GUST_SPREAD_MS + 1));
  });
}

/**
 * Idle motion, or null for none: under reduced motion, while the scene is not running (off
 * screen, or the app in the background), and for a still scene.
 */
export function idlePlan({
  motion,
  reducedMotion,
  running,
  ambient,
  tokens,
  seed,
}: {
  motion: SceneMotion;
  reducedMotion: boolean;
  running: boolean;
  ambient: AmbientParams;
  tokens: MotionTokens;
  /** The tree's variation seed: its gust rhythm. */
  seed: number;
}): IdlePlan | null {
  if (reducedMotion || !running || motion === 'still' || ambient.sway <= 0) return null;
  const calm = motion === 'calm';
  // A quiet tree is almost still: no gusts (docs/04 §5, vitality modulates idle energy).
  const gusty = !calm && ambient.sway >= 0.3;
  return {
    canopyDegrees: CANOPY_DEGREES * ambient.sway * (calm ? 0.5 : 1),
    canopyCycleMs: tokens.ambient.sway,
    backDegrees: calm ? 0 : BACK_DEGREES * ambient.sway,
    // Phase-shifted: the back and main layers keep cycles of their own, between the canopy's
    // and the front foliage's.
    backCycleMs: Math.round(tokens.ambient.foliage * 1.6),
    mainDegrees: calm ? 0 : MAIN_DEGREES * ambient.sway,
    mainCycleMs: Math.round(tokens.ambient.foliage * 1.27),
    frontDegrees: calm ? 0 : FRONT_DEGREES * ambient.sway,
    foliageCycleMs: tokens.ambient.foliage,
    driftDistance: calm ? 0 : DRIFT * ambient.sway,
    driftCycleMs: tokens.ambient.drift,
    twinkleCycleMs: TWINKLE_MS,
    gusts: gusty
      ? { intervalsMs: gustIntervals(seed), degrees: GUST_DEGREES * ambient.sway }
      : null,
    light: calm ? null : LIGHT,
  };
}

export const REACTION_KINDS = ['growth', 'stage', 'blossoms', 'trait'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

/**
 * A growth reaction the scene can play once the server has said what changed (Session
 * Completion, M3.2). The scene already shows the new tree; `stage` takes the tree it grew from.
 */
export type TreeReaction =
  | { kind: 'growth' }
  | { kind: 'stage'; from: TreeVisualState }
  | { kind: 'blossoms' }
  | { kind: 'trait' };

export interface ReactionPlan {
  /** A gentle gust through the canopy that settles with a well-damped spring. */
  gust: boolean;
  /** The layer that fades (or grows) in. */
  reveal: 'canopy' | 'tree' | 'blossoms' | 'traits';
  /** The previous tree fades out under the new one. */
  crossfade: boolean;
  /** 0 shows the final state at once. */
  durationMs: number;
}

const REVEALS: Record<ReactionKind, ReactionPlan['reveal']> = {
  growth: 'canopy',
  stage: 'tree',
  blossoms: 'blossoms',
  trait: 'traits',
};

export function reactionPlan(
  kind: ReactionKind,
  {
    reducedMotion,
    running,
    tokens,
  }: { reducedMotion: boolean; running: boolean; tokens: MotionTokens },
): ReactionPlan {
  const reveal = REVEALS[kind];
  // Not on screen: show the final state, never replay later (docs/04 §6).
  if (!running) return { gust: false, reveal, crossfade: false, durationMs: 0 };
  const crossfade = kind === 'stage';
  // Reduced motion: a short cross-fade, no movement (docs/04 §8).
  if (reducedMotion) return { gust: false, reveal, crossfade, durationMs: tokens.fast };
  const growth = kind === 'growth' || kind === 'stage';
  return {
    gust: growth,
    reveal,
    crossfade,
    durationMs: growth ? tokens.growth : tokens.reward,
  };
}
