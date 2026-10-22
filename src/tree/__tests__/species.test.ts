import { treeDto, type TreeFixtureOptions } from '../../test-utils/trees';
import { composeTree, type Ellipse, type TreeComposition } from '../composition';
import { describeTree } from '../describe-tree';
import { ambientFor, sceneColors, sceneLighting } from '../scene';
import { TREE_VIEWBOX } from '../signature/stages';
import { SPECIES_KEYS, speciesDefinition, speciesKeyOf } from '../species';
import { TREE_STAGES } from '../tree-contract';
import { toTreeVisualState } from '../visual-state';

const compose = (options: TreeFixtureOptions = {}) =>
  composeTree(toTreeVisualState(treeDto(options)));

/** What the tree has earned, as the composition draws it: never changed by a species. */
function earned(c: TreeComposition) {
  return {
    stage: c.stage,
    branches: c.branches.length,
    back: c.foliage.back.length,
    main: c.foliage.main.length,
    accents: c.foliage.main.filter((cluster) => cluster.accent).length,
    front: c.foliage.front.length,
    richness: c.foliage.richness.length,
    highlights: c.highlights.length,
    blossoms: c.blossoms.length,
    fruit: c.fruit.length,
    traits: c.traits.map((mark) => mark.decoration),
    glow: c.glow !== null,
    fireflies: c.fireflies,
    richnessTier: c.richnessTier,
  };
}

const LEVELS: TreeFixtureOptions[] = [
  { fullness: 0, blossoms: 0, richness: 0 },
  { fullness: 3, blossoms: 2, richness: 0, traits: ['streak-days:7'] },
  {
    fullness: 5,
    blossoms: 7,
    richness: 5,
    traits: ['streak-days:30', 'monthly-focus-hours:40'],
  },
];

function extent(e: Ellipse) {
  const a = (e.rotation * Math.PI) / 180;
  return {
    x: Math.sqrt((e.rx * Math.cos(a)) ** 2 + (e.ry * Math.sin(a)) ** 2),
    y: Math.sqrt((e.rx * Math.sin(a)) ** 2 + (e.ry * Math.cos(a)) ** 2),
  };
}

describe('species: the same framework, drawn in its own idiom (docs/03 §9)', () => {
  it('knows the A4.3 catalog, and draws anything else as the signature species', () => {
    expect([...SPECIES_KEYS].sort()).toEqual(
      [
        'signature',
        'oak',
        'sakura',
        'pine',
        'maple',
        'bonsai',
        'fantasy',
        'golden-sakura',
        'ancient-pine',
      ].sort(),
    );
    expect(speciesKeyOf('sakura')).toBe('sakura');
    for (const unknown of ['moon-tree', 'crystal-tree', '', 'SAKURA']) {
      expect(speciesKeyOf(unknown)).toBe('signature');
    }
    const tree = toTreeVisualState(treeDto({ species: 'moon-tree' }));
    expect(tree.species).toBe('signature');
    expect(tree.speciesId).toBe('moon-tree');
    expect(toTreeVisualState(treeDto({ species: 'pine' })).species).toBe('pine');
  });

  it('draws a rare variant from its base species with an effect of its own', () => {
    expect(speciesDefinition('golden-sakura').base).toBe('sakura');
    expect(speciesDefinition('ancient-pine').base).toBe('pine');
    expect(speciesDefinition('golden-sakura').effect).not.toBeNull();
    expect(speciesDefinition('sakura').effect).toBeNull();
  });

  it.each(SPECIES_KEYS)('%s never changes what the tree earned, at any stage or level', (key) => {
    for (const stage of TREE_STAGES) {
      for (const levels of LEVELS) {
        const options = { stage, ...levels };
        expect(earned(compose({ ...options, species: key }))).toEqual(earned(compose(options)));
      }
    }
  });

  it.each(SPECIES_KEYS)('%s stays inside its bounds and the scene, whatever the seed', (key) => {
    // Many seeds: the seed's lean and nudges must never carry a species past its bounds.
    const seeds = Array.from({ length: 24 }, (_, i) => (i * 2_654_435_761 + 97) >>> 0);
    for (const stage of TREE_STAGES) {
      for (const seed of seeds) {
        const c = compose({
          stage,
          fullness: 5,
          blossoms: 7,
          richness: 5,
          traits: ['streak-days:30', 'monthly-focus-hours:40'],
          species: key,
          seed,
        });
        const { x, y, width, height } = c.bounds;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + width).toBeLessThanOrEqual(TREE_VIEWBOX.width);
        expect(y + height).toBeLessThanOrEqual(TREE_VIEWBOX.height);
        const inside = (px: number, py: number, rx: number, ry: number) => {
          expect(px - rx).toBeGreaterThanOrEqual(x - 0.01);
          expect(px + rx).toBeLessThanOrEqual(x + width + 0.01);
          expect(py - ry).toBeGreaterThanOrEqual(y - 0.01);
        };
        for (const e of [
          ...c.foliage.back,
          ...c.foliage.main,
          ...c.foliage.front,
          ...c.foliage.richness,
        ]) {
          const { x: ex, y: ey } = extent(e);
          inside(e.cx, e.cy, ex, ey);
        }
        for (const dot of [...c.blossoms, ...c.fruit]) inside(dot.cx, dot.cy, dot.r, dot.r);
        for (const mark of c.traits) inside(mark.x, mark.y, mark.size, mark.size);
      }
    }
  });

  it('gives species their own silhouettes: a pine is narrow and tall, a sakura wide', () => {
    const at = (species: string) => compose({ stage: 'final_form', fullness: 5, species }).bounds;
    expect(at('pine').width).toBeLessThan(at('signature').width);
    expect(at('pine').height).toBeGreaterThan(at('bonsai').height);
    expect(at('sakura').width).toBeGreaterThan(at('signature').width);
  });

  it('keeps the signature species exactly as the core renderer drew it', () => {
    expect(compose({ stage: 'mature_tree', species: 'signature' })).toEqual(
      compose({ stage: 'mature_tree' }),
    );
  });

  it('is deterministic: the same state and seed draw the same tree', () => {
    const options = { stage: 'blooming_tree' as const, fullness: 4, blossoms: 5, species: 'maple' };
    expect(compose(options)).toEqual(compose(options));
  });

  it('colors each species from its own palette, with the same earned elements', () => {
    const colorsOf = (species: string) => {
      const c = compose({ stage: 'blooming_tree', blossoms: 5, species });
      return sceneColors(c, ambientFor('healthy'), sceneLighting('day'));
    };
    expect(colorsOf('sakura').blossom).not.toBe(colorsOf('signature').blossom);
    expect(colorsOf('maple').foliage.main).not.toBe(colorsOf('pine').foliage.main);
  });

  it('marks a rare variant’s effect in the composition, and nothing for the others', () => {
    expect(compose({ stage: 'final_form', species: 'golden-sakura' }).effect).toBe('golden-light');
    expect(compose({ stage: 'final_form', species: 'sakura' }).effect).toBeNull();
  });
});

describe('species in the tree’s description', () => {
  it('names the species, and keeps the signature description as it was', () => {
    const named = describeTree(
      toTreeVisualState(treeDto({ stage: 'young_tree', species: 'sakura' })),
      'en-US',
    );
    expect(named).toMatch(/^October 2026 tree\. Sakura\. Young Tree\./);
    const signature = describeTree(toTreeVisualState(treeDto({ stage: 'young_tree' })), 'en-US');
    expect(signature).toMatch(/^October 2026 tree\. Young Tree\./);
    const unknown = describeTree(
      toTreeVisualState(treeDto({ stage: 'young_tree', species: 'moon-tree' })),
      'en-US',
    );
    expect(unknown).toMatch(/^October 2026 tree\. Young Tree\./);
  });
});
