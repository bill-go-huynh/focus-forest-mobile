/**
 * The monthly tree as the API sends it (A3.1–A3.4: `TreeStateDto` in `GET /me/home`, session
 * growth results, and archived tree details). Product truth only: the server decides every
 * value here, and the client draws it (docs/03_TREE_SYSTEM.md §14, docs/07). New fields and new
 * enum values may arrive; the renderer adapter (`visual-state.ts`) degrades gracefully.
 */

/** The seven growth stages, in order (docs/03 §3). Machine identifiers, not labels. */
export const TREE_STAGES = [
  'seed',
  'sprout',
  'young_tree',
  'growing_tree',
  'mature_tree',
  'blooming_tree',
  'final_form',
] as const;

export type TreeStage = (typeof TREE_STAGES)[number];

/** The five vitality states (docs/03 §6), the only non-permanent dimension. */
export const VITALITY_STATES = ['thriving', 'healthy', 'stable', 'quiet', 'recovering'] as const;

export type VitalityState = (typeof VITALITY_STATES)[number];

export interface LevelDto {
  level: number;
  /** The highest level the configuration defines: the renderer scales between 0 and this. */
  maxLevel: number;
}

export interface TreeProgressDto {
  stage: TreeStage;
  /** 1 (Seed) to 7 (Final Form). */
  stageNumber: number;
  /** 0 to 1 within the current stage; null at Final Form. */
  progressToNextStage: number | null;
  /** Growth after the daily soft cap, in whole minutes. Never drawn from. */
  growthMinutes: number;
  fullness: LevelDto;
  blossoms: LevelDto;
  richness: { tier: number; maxTier: number };
}

export interface TreeTraitDto {
  /** A stable identifier such as "monthly-focus-hours:10". Unknown ones are ignored visually. */
  id: string;
  earnedAt: string;
}

export interface TreeStateDto {
  year: number;
  month: number;
  status: 'growing' | 'archived';
  species: string;
  /** Unsigned 32-bit integer. */
  variationSeed: number;
  partialFirstMonth: boolean;
  configVersion: number;
  progress: TreeProgressDto;
  traits: TreeTraitDto[];
  /** Null for an archived tree, which always renders "at rest". */
  vitality: VitalityState | null;
}
