import { speciesKeyOf } from './species';
import type { TreeStage } from './tree-contract';
import type { TreeVisualState } from './visual-state';

/** The fixed variation seed of previews: every species is shown the same way. */
const PREVIEW_SEED = 2_654_435_761;

/**
 * A species shown as an example (docs/05 → Species choice: "seed / mature previews"): the
 * species at a stage, full at Final Form. Not anyone's tree and never sent anywhere; the
 * user's own tree is always the server's.
 */
export function speciesPreview(speciesId: string, stage: TreeStage): TreeVisualState {
  const full = stage === 'final_form';
  const level = (on: boolean) => ({ level: on ? 5 : 0, max: 5, ratio: on ? 1 : 0 });
  return {
    year: 2026,
    month: 1,
    lifecycle: 'growing',
    species: speciesKeyOf(speciesId),
    speciesId,
    stage,
    stageProgress: null,
    fullness: level(full),
    blossoms: level(full),
    richness: level(false),
    traits: [],
    unknownTraitIds: [],
    traitIds: [],
    vitality: null,
    ambience: 'at_rest',
    seed: PREVIEW_SEED,
  };
}
