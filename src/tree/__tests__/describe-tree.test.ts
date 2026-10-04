import { assertCalmCopy } from '../../components/calm-copy';
import {
  EXAMPLE_MONTHS,
  STAGE_FIXTURES,
  treeDto,
  type TreeFixtureOptions,
} from '../../test-utils/trees';
import { describeTree } from '../describe-tree';
import { TREE_STAGES, VITALITY_STATES } from '../tree-contract';
import { toTreeVisualState } from '../visual-state';

const describeFixture = (options: TreeFixtureOptions = {}) =>
  describeTree(toTreeVisualState(treeDto(options)), 'en-US');

describe('describeTree', () => {
  it('reads the month, stage, canopy, blossoms, and vitality in one sentence set', () => {
    expect(
      describeFixture({ stage: 'mature_tree', fullness: 5, blossoms: 3, vitality: 'healthy' }),
    ).toBe('October 2026 tree. Mature Tree. Full canopy. Blossoms at level 3 of 7. Healthy.');
  });

  it.each(TREE_STAGES)('gives %s a meaningful, calm description', (stage) => {
    const text = describeTree(toTreeVisualState(STAGE_FIXTURES[stage]), 'en-US');
    expect(text).toMatch(/^October 2026 tree\. /);
    expect(text.length).toBeLessThan(220);
    assertCalmCopy(text, 'TreeScene');
  });

  it('names each stage', () => {
    const names = TREE_STAGES.map((stage) => describeFixture({ stage }).split('. ')[1]);
    expect(names).toEqual([
      'Seed',
      'Sprout',
      'Young Tree',
      'Growing Tree',
      'Mature Tree',
      'Blooming Tree',
      'Final Form',
    ]);
  });

  it('describes the canopy from the fullness level', () => {
    expect(describeFixture({ fullness: 0 })).toContain('Airy canopy.');
    expect(describeFixture({ fullness: 1 })).toContain('Light canopy.');
    expect(describeFixture({ fullness: 3 })).toContain('Filling canopy.');
    expect(describeFixture({ fullness: 5 })).toContain('Full canopy.');
    expect(describeFixture({ stage: 'sprout', fullness: 5 })).not.toContain('canopy');
  });

  it('leaves out blossoms and richness until there are some', () => {
    const text = describeFixture({ blossoms: 0, richness: 0 });
    expect(text).not.toContain('Blossom');
    expect(text).not.toContain('Richness');
    expect(describeFixture({ stage: 'final_form', richness: 2 })).toContain(
      'Richness tier 2 of 5.',
    );
  });

  it.each([
    ['thriving', 'Thriving.'],
    ['healthy', 'Healthy.'],
    ['stable', 'Stable.'],
    ['quiet', 'Resting quietly.'],
    ['recovering', 'Waking up.'],
  ] as const)('says a %s tree is “%s”', (vitality, words) => {
    const text = describeFixture({ vitality });
    expect(text.endsWith(words)).toBe(true);
    assertCalmCopy(text, 'TreeScene');
  });

  it('describes every vitality calmly', () => {
    for (const vitality of VITALITY_STATES)
      assertCalmCopy(describeFixture({ vitality }), 'TreeScene');
  });

  it('describes an archived tree as at rest', () => {
    expect(describeFixture({ status: 'archived', month: 9 })).toMatch(
      /^September 2026 tree\. .* At rest\.$/,
    );
  });

  it('names known milestone details, at most two, and counts the rest', () => {
    expect(describeFixture({ traits: ['streak-days:7'] })).toContain(
      "A songbird's nest from a 7-day streak.",
    );
    const many = describeFixture({
      traits: ['streak-days:3', 'streak-days:7', 'monthly-focus-hours:10', 'event-lantern:1'],
    });
    expect(many).toContain(
      "A songbird's nest from a 7-day streak, a hanging bloom from a 3-day streak, and 2 more milestone details.",
    );
  });

  it('counts traits it has no art for, without naming a lower milestone', () => {
    const text = describeFixture({ traits: ['streak-days:30', 'streak-days:60'] });
    expect(text).toContain('A lantern-flower from a 30-day streak and 1 more milestone detail.');
    expect(text).not.toContain('60-day');
    expect(describeFixture({ traits: ['streak-days:60'] })).toContain('1 milestone detail.');
  });

  it('describes the example months distinctly', () => {
    const texts = Object.values(EXAMPLE_MONTHS).map((dto) =>
      describeTree(toTreeVisualState(dto), 'en-US'),
    );
    expect(new Set(texts).size).toBe(4);
    for (const text of texts) expect(text.endsWith('At rest.')).toBe(true);
  });
});
