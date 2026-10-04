import { STAGE_FIXTURES, treeDto } from '../../test-utils/trees';
import { TREE_STAGES, VITALITY_STATES, type TreeStateDto } from '../tree-contract';
import { toTreeVisualState } from '../visual-state';

/** A DTO with fields the contract does not allow, as a newer or broken server could send. */
const loose = (dto: TreeStateDto, patch: (value: Record<string, any>) => void): TreeStateDto => {
  const copy = structuredClone(dto) as unknown as Record<string, any>;
  patch(copy);
  return copy as unknown as TreeStateDto;
};

describe('toTreeVisualState', () => {
  it.each(TREE_STAGES)('keeps the server stage %s', (stage) => {
    expect(toTreeVisualState(STAGE_FIXTURES[stage]).stage).toBe(stage);
  });

  it('takes the stage from the server, never from focus time', () => {
    const tiny = treeDto({ stage: 'final_form' });
    tiny.progress.growthMinutes = 0;
    const huge = treeDto({ stage: 'sprout' });
    huge.progress.growthMinutes = 100_000;
    expect(toTreeVisualState(tiny).stage).toBe('final_form');
    expect(toTreeVisualState(huge).stage).toBe('sprout');
  });

  it('falls back to the stage number for an unknown stage name, then to a Seed', () => {
    const renamed = loose(treeDto({ stage: 'growing_tree' }), (dto) => {
      dto.progress.stage = 'sapling';
    });
    expect(toTreeVisualState(renamed).stage).toBe('growing_tree');
    const broken = loose(treeDto(), (dto) => {
      dto.progress.stage = 'sapling';
      dto.progress.stageNumber = 12;
    });
    expect(toTreeVisualState(broken).stage).toBe('seed');
  });

  it('keeps the lifecycle, month, seed, and the server progress within the stage', () => {
    const visual = toTreeVisualState(treeDto({ seed: 42, month: 3, year: 2027 }));
    expect(visual).toMatchObject({
      year: 2027,
      month: 3,
      lifecycle: 'growing',
      seed: 42,
      stageProgress: 0.25,
    });
    expect(toTreeVisualState(treeDto({ stage: 'final_form' })).stageProgress).toBeNull();
  });

  it('normalizes levels against the maxima the server sends', () => {
    const visual = toTreeVisualState(treeDto({ fullness: 2, blossoms: 7, richness: 0 }));
    expect(visual.fullness).toEqual({ level: 2, max: 5, ratio: 0.4 });
    expect(visual.blossoms).toEqual({ level: 7, max: 7, ratio: 1 });
    expect(visual.richness).toEqual({ level: 0, max: 5, ratio: 0 });
  });

  it('clamps out-of-range or malformed levels instead of failing', () => {
    const odd = loose(treeDto(), (dto) => {
      dto.progress.fullness = { level: 9, maxLevel: 5 };
      dto.progress.blossoms = { level: -2, maxLevel: 7 };
      dto.progress.richness = { tier: 'high', maxTier: 0 };
    });
    const visual = toTreeVisualState(odd);
    expect(visual.fullness).toEqual({ level: 5, max: 5, ratio: 1 });
    expect(visual.blossoms).toEqual({ level: 0, max: 7, ratio: 0 });
    expect(visual.richness).toEqual({ level: 0, max: 0, ratio: 0 });
  });

  it.each(VITALITY_STATES)('keeps a growing tree’s vitality %s', (vitality) => {
    const visual = toTreeVisualState(treeDto({ vitality }));
    expect(visual.vitality).toBe(vitality);
    expect(visual.ambience).toBe(vitality);
  });

  it('shows an archived tree at rest, whatever vitality it carries', () => {
    expect(toTreeVisualState(treeDto({ status: 'archived' }))).toMatchObject({
      lifecycle: 'archived',
      vitality: null,
      ambience: 'at_rest',
    });
    const odd = treeDto({ status: 'archived', vitality: 'quiet' });
    expect(toTreeVisualState(odd)).toMatchObject({ vitality: null, ambience: 'at_rest' });
  });

  it('shows a growing tree with an unknown vitality at rest, without naming a state', () => {
    const odd = loose(treeDto(), (dto) => {
      dto.vitality = 'sparkling';
    });
    expect(toTreeVisualState(odd)).toMatchObject({ vitality: null, ambience: 'at_rest' });
  });

  it('parses known traits, keeps unknown ones as data, and lists each id once', () => {
    const visual = toTreeVisualState(
      treeDto({
        traits: [
          'streak-days:7',
          'event-lantern:2027',
          'streak-days:7',
          'monthly-focus-hours:10',
          'streak-days:x',
        ],
      }),
    );
    expect(visual.traits).toEqual([
      { id: 'streak-days:7', family: 'streak-days', value: 7 },
      { id: 'monthly-focus-hours:10', family: 'monthly-focus-hours', value: 10 },
    ]);
    expect(visual.unknownTraitIds).toEqual(['event-lantern:2027', 'streak-days:x']);
    expect(visual.traitIds).toEqual([
      'streak-days:7',
      'event-lantern:2027',
      'monthly-focus-hours:10',
      'streak-days:x',
    ]);
  });

  it('survives a missing or malformed trait list', () => {
    const missing = loose(treeDto(), (dto) => {
      delete dto.traits;
    });
    expect(toTreeVisualState(missing).traits).toEqual([]);
    const malformed = loose(treeDto(), (dto) => {
      dto.traits = [null, { id: 7 }, { id: 'streak-days:3' }];
    });
    expect(toTreeVisualState(malformed).traitIds).toEqual(['streak-days:3']);
  });

  it('draws any species as the signature species until more species exist', () => {
    const other = loose(treeDto(), (dto) => {
      dto.species = 'moon-tree';
    });
    expect(toTreeVisualState(other)).toMatchObject({
      species: 'signature',
      speciesId: 'moon-tree',
    });
  });

  it('keeps the seed an unsigned 32-bit integer', () => {
    expect(toTreeVisualState(treeDto({ seed: 4_294_967_295 })).seed).toBe(4_294_967_295);
    const odd = loose(treeDto(), (dto) => {
      dto.variationSeed = 'abc';
    });
    expect(toTreeVisualState(odd).seed).toBe(0);
    expect(toTreeVisualState(treeDto({ seed: -1 })).seed).toBe(4_294_967_295);
  });
});
