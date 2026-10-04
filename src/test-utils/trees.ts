import type { TreeStage, TreeStateDto, VitalityState } from '../tree/tree-contract';

/**
 * Monthly tree fixtures shaped like the API's `TreeStateDto` (A3.1–A3.4, `GET /me/home` →
 * `tree`, `GET /me/trees/:year/:month` → `tree`). Every value is already product truth: the
 * renderer only draws it. Level maxima follow the current configuration (fullness 5,
 * blossoms 7, richness 5); the renderer must work with any maxima the server sends.
 */

const STAGE_NUMBERS: Record<TreeStage, number> = {
  seed: 1,
  sprout: 2,
  young_tree: 3,
  growing_tree: 4,
  mature_tree: 5,
  blooming_tree: 6,
  final_form: 7,
};

export interface TreeFixtureOptions {
  stage?: TreeStage;
  fullness?: number;
  blossoms?: number;
  richness?: number;
  traits?: readonly string[];
  vitality?: VitalityState | null;
  status?: 'growing' | 'archived';
  seed?: number;
  year?: number;
  month?: number;
}

export function treeDto({
  stage = 'mature_tree',
  fullness = 3,
  blossoms = 2,
  richness = 0,
  traits = [],
  vitality,
  status = 'growing',
  seed = 2_654_435_761,
  year = 2026,
  month = 10,
}: TreeFixtureOptions = {}): TreeStateDto {
  return {
    year,
    month,
    status,
    species: 'signature',
    variationSeed: seed,
    partialFirstMonth: false,
    configVersion: 5,
    progress: {
      stage,
      stageNumber: STAGE_NUMBERS[stage],
      progressToNextStage: stage === 'final_form' ? null : 0.25,
      growthMinutes: 600,
      fullness: { level: fullness, maxLevel: 5 },
      blossoms: { level: blossoms, maxLevel: 7 },
      richness: { tier: richness, maxTier: 5 },
    },
    traits: traits.map((id, index) => ({
      id,
      earnedAt: `2026-10-${String(index + 2).padStart(2, '0')}T18:00:00.000Z`,
    })),
    // The API sends null for an archived tree, a state for a growing one.
    vitality: vitality === undefined ? (status === 'archived' ? null : 'healthy') : vitality,
  };
}

export const STAGE_FIXTURES: Record<TreeStage, TreeStateDto> = {
  seed: treeDto({ stage: 'seed', fullness: 0, blossoms: 0 }),
  sprout: treeDto({ stage: 'sprout', fullness: 1, blossoms: 1 }),
  young_tree: treeDto({ stage: 'young_tree', fullness: 1, blossoms: 1 }),
  growing_tree: treeDto({ stage: 'growing_tree', fullness: 2, blossoms: 2 }),
  mature_tree: treeDto({ stage: 'mature_tree', fullness: 3, blossoms: 3 }),
  blooming_tree: treeDto({ stage: 'blooming_tree', fullness: 4, blossoms: 4 }),
  final_form: treeDto({ stage: 'final_form', fullness: 5, blossoms: 5, richness: 1 }),
};

/**
 * The Tree System example months (docs/03 §15) as archived trees, consistent with the API's
 * A3.5 characterization (test/insights/core-loop-examples.int-spec.ts): A is a Young Tree with
 * fullness at most 1 and no traits; B a Mature Tree, fullness at least 4, with streak traits;
 * C Final Form, less full than B, with focus-hour traits; D Final Form at top fullness with
 * more blossoms than B. The exact levels are representative values inside those bounds.
 */
export const EXAMPLE_MONTHS = {
  A: treeDto({
    status: 'archived',
    month: 9,
    stage: 'young_tree',
    fullness: 1,
    blossoms: 1,
    richness: 0,
    seed: 11,
  }),
  B: treeDto({
    status: 'archived',
    month: 9,
    stage: 'mature_tree',
    fullness: 4,
    blossoms: 5,
    richness: 0,
    traits: ['streak-days:3', 'streak-days:7'],
    seed: 22,
  }),
  C: treeDto({
    status: 'archived',
    month: 9,
    stage: 'final_form',
    fullness: 2,
    blossoms: 4,
    richness: 0,
    traits: ['streak-days:3', 'monthly-focus-hours:10', 'monthly-focus-hours:25'],
    seed: 33,
  }),
  D: treeDto({
    status: 'archived',
    month: 9,
    stage: 'final_form',
    fullness: 5,
    blossoms: 7,
    richness: 4,
    traits: [
      'streak-days:3',
      'streak-days:7',
      'streak-days:14',
      'monthly-focus-hours:10',
      'monthly-focus-hours:25',
      'monthly-focus-hours:40',
    ],
    seed: 44,
  }),
} as const satisfies Record<string, TreeStateDto>;
