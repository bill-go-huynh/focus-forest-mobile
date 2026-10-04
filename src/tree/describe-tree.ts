import { traitLook } from './signature/trait-decorations';
import type { TreeStage, VitalityState } from './tree-contract';
import type { KnownTrait, TreeVisualState } from './visual-state';

/**
 * The tree's one screen-reader description (docs/11 → Screen readers), from server truth only:
 * month, stage, canopy, blossoms, richness, a few milestone details, and vitality, or "At rest"
 * for an archived tree. English until localization arrives; dates follow `locale`.
 */

const STAGE_NAMES: Record<TreeStage, string> = {
  seed: 'Seed',
  sprout: 'Sprout',
  young_tree: 'Young Tree',
  growing_tree: 'Growing Tree',
  mature_tree: 'Mature Tree',
  blooming_tree: 'Blooming Tree',
  final_form: 'Final Form',
};

const VITALITY_WORDS: Record<VitalityState, string> = {
  thriving: 'Thriving.',
  healthy: 'Healthy.',
  stable: 'Stable.',
  quiet: 'Resting quietly.',
  recovering: 'Waking up.',
};

/** Milestone details named in full; the rest are counted. */
const NAMED_TRAITS = 2;

export function stageName(stage: TreeStage): string {
  return STAGE_NAMES[stage];
}

export function describeTree(tree: TreeVisualState, locale?: string): string {
  const month = new Date(Date.UTC(tree.year, tree.month - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const parts = [`${month} tree.`, `${STAGE_NAMES[tree.stage]}.`];
  if (tree.stage !== 'seed' && tree.stage !== 'sprout')
    parts.push(canopyWords(tree.fullness.ratio));
  if (tree.blossoms.level > 0) {
    parts.push(`Blossoms at level ${tree.blossoms.level} of ${tree.blossoms.max}.`);
  }
  if (tree.richness.level > 0) {
    parts.push(`Richness tier ${tree.richness.level} of ${tree.richness.max}.`);
  }
  const traits = traitWords(tree);
  if (traits) parts.push(traits);
  if (tree.lifecycle === 'archived') parts.push('At rest.');
  else if (tree.vitality) parts.push(VITALITY_WORDS[tree.vitality]);
  return parts.join(' ');
}

function canopyWords(ratio: number): string {
  if (ratio === 0) return 'Airy canopy.';
  if (ratio < 0.4) return 'Light canopy.';
  if (ratio < 0.8) return 'Filling canopy.';
  return 'Full canopy.';
}

/** Streak details first, then focus-hour ones, the biggest milestone first in each. */
function traitWords(tree: TreeVisualState): string | null {
  const drawn = tree.traits
    .flatMap((trait) => {
      const look = traitLook(trait);
      return look ? [{ trait, name: look.name }] : [];
    })
    .sort(
      (a, b) =>
        Number(a.trait.family !== 'streak-days') - Number(b.trait.family !== 'streak-days') ||
        b.trait.value - a.trait.value,
    );
  const named = drawn
    .slice(0, NAMED_TRAITS)
    .map(({ trait, name }) => `${name} from ${milestoneWords(trait)}`);
  // Unknown traits and ones below every authored milestone are counted, never dropped.
  const more = tree.traitIds.length - named.length;
  const items = more > 0 ? [...named, detailCount(more, named.length > 0)] : named;
  if (items.length === 0) return null;
  const sentence = joinList(items);
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function detailCount(count: number, more: boolean): string {
  return `${count} ${more ? 'more ' : ''}milestone detail${count === 1 ? '' : 's'}`;
}

/** "a", "a and b", "a, b, and c". */
function joinList(items: readonly string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function milestoneWords(trait: KnownTrait): string {
  return trait.family === 'streak-days'
    ? `a ${trait.value}-day streak`
    : `${trait.value} focus hours`;
}
