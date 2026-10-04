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
  /** 0 when the front foliage does not move on its own. */
  frontDegrees: number;
  foliageCycleMs: number;
  /** In view-box units; 0 when particles stay put. */
  driftDistance: number;
  driftCycleMs: number;
}

/** The sway at full energy, in degrees, and the particle drift in view-box units. */
const CANOPY_DEGREES = 1.2;
const FRONT_DEGREES = 1.8;
const DRIFT = 4;

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
}: {
  motion: SceneMotion;
  reducedMotion: boolean;
  running: boolean;
  ambient: AmbientParams;
  tokens: MotionTokens;
}): IdlePlan | null {
  if (reducedMotion || !running || motion === 'still' || ambient.sway <= 0) return null;
  const calm = motion === 'calm';
  return {
    canopyDegrees: CANOPY_DEGREES * ambient.sway * (calm ? 0.5 : 1),
    canopyCycleMs: tokens.ambient.sway,
    frontDegrees: calm ? 0 : FRONT_DEGREES * ambient.sway,
    foliageCycleMs: tokens.ambient.foliage,
    driftDistance: calm ? 0 : DRIFT * ambient.sway,
    driftCycleMs: tokens.ambient.drift,
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
