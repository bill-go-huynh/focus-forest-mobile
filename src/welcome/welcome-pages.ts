import { speciesPreview, type TimeOfDay, type TreeVisualState } from '../tree';
import type { TreeStage } from '../tree/tree-contract';

/**
 * The welcome's pages (docs/02 Onboarding: "show the concept screens before account creation";
 * docs/05 §3 Welcome): seed → tree → forest, then rest days. Each scene is an example drawn by
 * the real renderer, never anyone's tree, so it is decorative: the words carry the meaning.
 */

export type WelcomeArt =
  | { kind: 'growing'; stages: readonly TreeVisualState[]; timeOfDay: TimeOfDay }
  | { kind: 'tree'; tree: TreeVisualState; timeOfDay: TimeOfDay }
  | { kind: 'forest'; trees: readonly TreeVisualState[]; timeOfDay: TimeOfDay };

export interface WelcomePage {
  key: string;
  title: string;
  body: string;
  art: WelcomeArt;
}

/** An example tree: a species at a stage, with its canopy and blossoms as full as asked (0–1). */
export function exampleTree(
  species: string,
  stage: TreeStage,
  { fullness = 0, blossoms = 0 }: { fullness?: number; blossoms?: number } = {},
): TreeVisualState {
  const level = (ratio: number) => ({ level: Math.round(ratio * 5), max: 5, ratio });
  return {
    ...speciesPreview(species, stage),
    fullness: level(fullness),
    blossoms: level(blossoms),
    vitality: 'thriving',
    ambience: 'thriving',
  };
}

/** The first page's seed grows through these stages while it is in view. */
export const GROWING_STAGES: readonly TreeVisualState[] = [
  exampleTree('signature', 'seed'),
  exampleTree('signature', 'sprout'),
  exampleTree('signature', 'young_tree', { fullness: 0.4 }),
  exampleTree('signature', 'growing_tree', { fullness: 0.7 }),
];

export const WELCOME_PAGES: readonly WelcomePage[] = [
  {
    key: 'grow',
    title: 'Focus grows a tree',
    body: 'Every session you finish helps your tree grow, a little at a time.',
    art: { kind: 'growing', stages: GROWING_STAGES, timeOfDay: 'dawn' },
  },
  {
    key: 'month',
    title: 'One month, one tree',
    body: 'Each month starts from a new seed. Reach your daily goal and it opens into blossom.',
    art: {
      kind: 'tree',
      tree: exampleTree('signature', 'final_form', { fullness: 1, blossoms: 1 }),
      timeOfDay: 'golden_hour',
    },
  },
  {
    key: 'forest',
    title: 'A forest of your months',
    body: 'When a month ends, its tree joins your forest and stays there, a quiet record of your focus.',
    art: {
      kind: 'forest',
      trees: [
        exampleTree('oak', 'mature_tree', { fullness: 0.8 }),
        exampleTree('sakura', 'final_form', { fullness: 1, blossoms: 1 }),
        exampleTree('pine', 'blooming_tree', { fullness: 0.9 }),
      ],
      timeOfDay: 'day',
    },
  },
  {
    key: 'rest',
    title: 'Rest is part of growing',
    body: 'Plan rest days whenever you need them. Your streak and your tree are kept safe.',
    art: {
      kind: 'tree',
      tree: exampleTree('signature', 'mature_tree', { fullness: 0.8, blossoms: 0.4 }),
      timeOfDay: 'night',
    },
  },
];
