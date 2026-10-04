import type { TreeStateResponse } from '../api/core-loop';

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

/**
 * The tree as the API sends it, checked by `treeStateSchema` (src/api/core-loop.ts). Its stage
 * and vitality are strings: a value from a newer server is kept and the adapter falls back.
 */
export type TreeStateDto = TreeStateResponse;
