import {
  EXAMPLE_MONTHS,
  STAGE_FIXTURES,
  treeDto,
  type TreeFixtureOptions,
} from '../../test-utils/trees';
import { composeTree, type Ellipse, type TreeComposition } from '../composition';
import { DECORATIONS, SIGNATURE_STAGES, TREE_VIEWBOX } from '../signature/stages';
import { TREE_STAGES, VITALITY_STATES } from '../tree-contract';
import { toTreeVisualState } from '../visual-state';

const compose = (options: TreeFixtureOptions = {}) =>
  composeTree(toTreeVisualState(treeDto(options)));

const foliageCount = (c: TreeComposition) =>
  c.foliage.back.length + c.foliage.main.length + c.foliage.front.length;

/** Half the width and height of a (rotated) ellipse. */
function extent(e: Ellipse) {
  const a = (e.rotation * Math.PI) / 180;
  const [cos, sin] = [Math.cos(a), Math.sin(a)];
  return {
    x: Math.sqrt((e.rx * cos) ** 2 + (e.ry * sin) ** 2),
    y: Math.sqrt((e.rx * sin) ** 2 + (e.ry * cos) ** 2),
  };
}

/** Every drawn tree element (not the ground, glow, or particles) lies inside the bounds. */
function expectInsideBounds(c: TreeComposition) {
  const { x, y, width, height } = c.bounds;
  const inside = (px: number, py: number, rx: number, ry = rx) => {
    expect(px - rx).toBeGreaterThanOrEqual(x);
    expect(px + rx).toBeLessThanOrEqual(x + width);
    expect(py - ry).toBeGreaterThanOrEqual(y);
    expect(py + ry).toBeLessThanOrEqual(y + height);
  };
  const ellipses = [
    ...c.foliage.back,
    ...c.foliage.main,
    ...c.foliage.front,
    ...c.foliage.richness,
    ...c.highlights,
  ];
  for (const e of ellipses) inside(e.cx, e.cy, extent(e).x, extent(e).y);
  for (const dot of [...c.blossoms, ...c.fruit]) inside(dot.cx, dot.cy, dot.r);
  for (const mark of c.traits) inside(mark.x, mark.y, mark.size);
}

describe('signature species stages', () => {
  it('defines all seven stages in order', () => {
    expect(SIGNATURE_STAGES.map((art) => art.stage)).toEqual([...TREE_STAGES]);
  });

  it.each(TREE_STAGES)('%s is a complete composition with every core layer', (stage) => {
    const art = SIGNATURE_STAGES.find((entry) => entry.stage === stage)!;
    expect(art.mound.rx).toBeGreaterThan(0);
    expect(art.particleSlots.length).toBeGreaterThanOrEqual(6);
    // Every decoration has a place at every stage, so a trait is never lost to a small tree.
    expect(Object.keys(art.traitSlots).sort()).toEqual([...DECORATIONS].sort());
    if (stage === 'seed') {
      expect(art.seed).not.toBeNull();
      expect(art.roots).not.toBeNull();
      return;
    }
    expect(art.trunk).not.toBeNull();
    expect(art.foliage.main.core.length).toBeGreaterThanOrEqual(2);
    expect(art.blossomSlots.length).toBeGreaterThan(0);
    expect(art.blossomOrders.length).toBeGreaterThanOrEqual(2);
    for (const order of art.blossomOrders) {
      expect([...order].sort((a, b) => a - b)).toEqual(art.blossomSlots.map((_, i) => i));
    }
    if (stage !== 'sprout') {
      expect(art.branches.core.length).toBeGreaterThanOrEqual(3);
      expect(art.foliage.back.core.length).toBeGreaterThan(0);
      expect(art.foliage.front.core.length).toBeGreaterThan(0);
    }
  });

  it('gives each stage its own, larger silhouette', () => {
    const areas = SIGNATURE_STAGES.map((art) => art.bounds.width * art.bounds.height);
    for (let i = 1; i < areas.length; i += 1) expect(areas[i]).toBeGreaterThan(areas[i - 1]!);
    for (const art of SIGNATURE_STAGES) {
      expect(art.bounds.x).toBeGreaterThanOrEqual(0);
      expect(art.bounds.x + art.bounds.width).toBeLessThanOrEqual(TREE_VIEWBOX.width);
    }
  });

  it('keeps fruit and secondary foliage for Final Form, the only stage richness follows', () => {
    for (const art of SIGNATURE_STAGES) {
      const final = art.stage === 'final_form';
      expect(art.fruitSlots.length > 0).toBe(final);
      expect(art.foliage.richness.length > 0).toBe(final);
    }
  });
});

describe('composeTree', () => {
  it.each(TREE_STAGES)('draws %s inside its authored bounds for many seeds', (stage) => {
    for (let seed = 0; seed < 40; seed += 1) {
      const composition = compose({ stage, fullness: 5, blossoms: 7, richness: 5, seed });
      expect(composition.stage).toBe(stage);
      expectInsideBounds(composition);
    }
  });

  describe('fullness', () => {
    it.each(TREE_STAGES.filter((stage) => stage !== 'seed'))(
      '%s fills in with fullness without changing stage or size',
      (stage) => {
        const counts = [0, 1, 2, 3, 4, 5].map((fullness) => compose({ stage, fullness }));
        for (let i = 1; i < counts.length; i += 1) {
          expect(foliageCount(counts[i]!)).toBeGreaterThanOrEqual(foliageCount(counts[i - 1]!));
          expect(counts[i]!.stage).toBe(stage);
          expect(counts[i]!.bounds).toEqual(counts[0]!.bounds);
          expect(counts[i]!.trunk).toEqual(counts[0]!.trunk);
        }
        expect(foliageCount(counts[5]!)).toBeGreaterThan(foliageCount(counts[0]!));
      },
    );

    it('keeps a graceful canopy at the lowest fullness', () => {
      const sparse = compose({ stage: 'mature_tree', fullness: 0 });
      const art = SIGNATURE_STAGES.find((entry) => entry.stage === 'mature_tree')!;
      expect(sparse.foliage.main).toHaveLength(art.foliage.main.core.length);
      expect(sparse.branches).toHaveLength(art.branches.core.length);
    });

    it('reveals more branches as the tree fills in', () => {
      expect(compose({ fullness: 5 }).branches.length).toBeGreaterThan(
        compose({ fullness: 0 }).branches.length,
      );
    });
  });

  describe('blossoms', () => {
    it('shows none at level 0 and at least one from level 1', () => {
      expect(compose({ blossoms: 0 }).blossoms).toEqual([]);
      expect(compose({ blossoms: 1 }).blossoms.length).toBeGreaterThanOrEqual(1);
    });

    it.each(TREE_STAGES.filter((stage) => stage !== 'seed'))(
      '%s reveals more authored blossom slots with the level, up to its cap',
      (stage) => {
        const art = SIGNATURE_STAGES.find((entry) => entry.stage === stage)!;
        let previous = 0;
        for (let level = 0; level <= 7; level += 1) {
          const shown = compose({ stage, blossoms: level }).blossoms.length;
          expect(shown).toBeGreaterThanOrEqual(previous);
          expect(shown).toBeLessThanOrEqual(art.blossomSlots.length);
          previous = shown;
        }
        expect(previous).toBe(art.blossomSlots.length);
      },
    );

    it('places the same blossoms for the same tree', () => {
      expect(compose({ blossoms: 4, seed: 9 }).blossoms).toEqual(
        compose({ blossoms: 4, seed: 9 }).blossoms,
      );
    });

    it('never changes the stage or size', () => {
      expect(compose({ blossoms: 7 }).bounds).toEqual(compose({ blossoms: 0 }).bounds);
    });
  });

  describe('richness', () => {
    const final = (richness: number) => compose({ stage: 'final_form', fullness: 3, richness });
    const features = (c: TreeComposition) => ({
      secondaryFoliage: c.foliage.richness.length > 0,
      fruit: c.fruit.length > 0,
      colorVariation: c.highlights.length > 0,
      glow: c.glow !== null,
      fireflies: c.fireflies,
    });

    it('adds one authored feature per tier, in order', () => {
      expect(features(final(0))).toEqual({
        secondaryFoliage: false,
        fruit: false,
        colorVariation: false,
        glow: false,
        fireflies: false,
      });
      expect(features(final(1))).toMatchObject({ secondaryFoliage: true, fruit: false });
      expect(features(final(2))).toMatchObject({ fruit: true, colorVariation: false });
      expect(features(final(3))).toMatchObject({ colorVariation: true, glow: false });
      expect(features(final(4))).toMatchObject({ glow: true, fireflies: false });
      expect(features(final(5))).toMatchObject({ glow: true, fireflies: true });
    });

    it('makes every tier distinguishable and never enlarges the tree', () => {
      const signatures = new Set(
        [0, 1, 2, 3, 4, 5].map((tier) => JSON.stringify(features(final(tier)))),
      );
      expect(signatures.size).toBe(6);
      for (const tier of [1, 2, 3, 4, 5]) {
        expect(final(tier).bounds).toEqual(final(0).bounds);
        expect(final(tier).stage).toBe('final_form');
      }
    });

    it('caps at the top tier', () => {
      const odd = treeDto({ stage: 'final_form', richness: 9 });
      odd.progress.richness.maxTier = 9;
      expect(features(composeTree(toTreeVisualState(odd)))).toEqual(features(final(5)));
    });

    it('scales a server with more tiers onto the authored ones', () => {
      const odd = treeDto({ stage: 'final_form', richness: 5 });
      odd.progress.richness.maxTier = 10;
      // Half the server's tiers: the renderer's middle tier (color variation, no glow).
      expect(features(composeTree(toTreeVisualState(odd)))).toMatchObject({
        colorVariation: true,
        glow: false,
      });
    });
  });

  describe('milestone traits', () => {
    it('maps known traits to authored decorations', () => {
      const marks = compose({ traits: ['streak-days:7', 'monthly-focus-hours:10'] }).traits;
      expect(marks.map((mark) => mark.decoration).sort()).toEqual(['seedpod', 'songbird-nest']);
    });

    it.each([
      ['streak-days:3', 'hanging-bloom'],
      ['streak-days:7', 'songbird-nest'],
      ['streak-days:14', 'vine-ribbon'],
      ['streak-days:30', 'lantern-flower'],
      ['monthly-focus-hours:10', 'seedpod'],
      ['monthly-focus-hours:25', 'heartwood-ring'],
      ['monthly-focus-hours:40', 'golden-leaf'],
    ] as const)('draws the authored decoration for exactly %s', (id, decoration) => {
      expect(compose({ traits: [id] }).traits).toEqual([
        expect.objectContaining({ decoration, traitIds: [id] }),
      ]);
    });

    it('draws a decoration once for a duplicate id', () => {
      const marks = compose({ traits: ['streak-days:30', 'streak-days:30'] }).traits;
      expect(marks).toHaveLength(1);
      expect(marks[0]).toMatchObject({
        decoration: 'lantern-flower',
        traitIds: ['streak-days:30'],
      });
    });

    it('never draws a lower milestone’s art for an id it has no art for', () => {
      expect(compose({ traits: ['streak-days:60'] }).traits).toEqual([]);
      expect(compose({ traits: ['streak-days:100'] }).traits).toEqual([]);
      const marks = compose({ traits: ['streak-days:30', 'streak-days:60'] }).traits;
      expect(marks).toEqual([
        expect.objectContaining({ decoration: 'lantern-flower', traitIds: ['streak-days:30'] }),
      ]);
    });

    it('keeps an unsupported focus-hour trait as data but draws nothing for it', () => {
      const tree = toTreeVisualState(treeDto({ traits: ['monthly-focus-hours:15'] }));
      expect(tree.traitIds).toEqual(['monthly-focus-hours:15']);
      expect(composeTree(tree).traits).toEqual([]);
      expect(compose({ traits: ['monthly-focus-hours:50'] }).traits).toEqual([]);
    });

    it('draws known traits the same whatever unknown traits come with them', () => {
      const known = ['streak-days:7', 'monthly-focus-hours:25'];
      const alone = compose({ traits: known }).traits;
      const mixed = compose({
        traits: [
          'event-lantern:1',
          known[0]!,
          'streak-days:60',
          known[1]!,
          'monthly-focus-hours:99',
        ],
      }).traits;
      expect(mixed).toEqual(alone);
    });

    it('sets traits on the ground before the tree has branches', () => {
      for (const stage of ['seed', 'sprout'] as const) {
        const marks = compose({
          stage,
          traits: ['streak-days:7', 'monthly-focus-hours:25'],
        }).traits;
        expect(marks.map((mark) => mark.anchor)).toEqual(['ground', 'ground']);
      }
      const grown = compose({ stage: 'mature_tree', traits: ['streak-days:7'] }).traits;
      expect(grown[0]!.anchor).toBe('canopy');
    });
  });

  describe('vitality', () => {
    it('never changes anything the tree has earned', () => {
      const earned = {
        stage: 'blooming_tree',
        fullness: 3,
        blossoms: 4,
        richness: 0,
        traits: ['streak-days:7'],
      } as const;
      const base = compose({ ...earned, vitality: 'thriving' });
      for (const vitality of VITALITY_STATES) {
        expect(compose({ ...earned, vitality })).toEqual(base);
      }
      expect(compose({ ...earned, status: 'archived' })).toEqual(base);
    });
  });

  describe('variation seed', () => {
    it('gives the same tree for the same state and seed', () => {
      const options = {
        stage: 'final_form',
        fullness: 4,
        blossoms: 5,
        richness: 3,
        seed: 77,
      } as const;
      expect(compose(options)).toEqual(compose(options));
    });

    it('lets different seeds choose different authored variations', () => {
      const looks = new Set(
        Array.from({ length: 12 }, (_, seed) =>
          JSON.stringify(compose({ stage: 'mature_tree', blossoms: 3, seed })),
        ),
      );
      expect(looks.size).toBeGreaterThan(3);
    });

    it('uses the seed’s choices, never Math.random', () => {
      const random = jest.spyOn(Math, 'random').mockImplementation(() => {
        throw new Error('Math.random must not decide how a tree looks.');
      });
      try {
        for (const stage of TREE_STAGES) compose({ stage, fullness: 5, blossoms: 7, richness: 5 });
      } finally {
        random.mockRestore();
      }
    });

    it('keeps the variation restrained: the same stage keeps its bounds for every seed', () => {
      const bounds = new Set(
        Array.from({ length: 20 }, (_, seed) => JSON.stringify(compose({ seed }).bounds)),
      );
      // Mirroring is the only change to the outline.
      expect(bounds.size).toBeLessThanOrEqual(2);
    });
  });

  describe('example months (docs/03 §15)', () => {
    const shape = (dto: (typeof EXAMPLE_MONTHS)[keyof typeof EXAMPLE_MONTHS]) => {
      const c = composeTree(toTreeVisualState(dto));
      return {
        area: c.bounds.width * c.bounds.height,
        foliage: foliageCount(c),
        blossoms: c.blossoms.length,
        traits: c.traits.length,
        rich: c.foliage.richness.length + c.fruit.length + c.highlights.length + (c.glow ? 1 : 0),
      };
    };
    const A = shape(EXAMPLE_MONTHS.A);
    const B = shape(EXAMPLE_MONTHS.B);
    const C = shape(EXAMPLE_MONTHS.C);
    const D = shape(EXAMPLE_MONTHS.D);

    it('A is small and light', () => {
      expect(A.area).toBeLessThan(B.area);
      expect(A.foliage).toBeLessThan(B.foliage);
      expect(A.traits).toBe(0);
    });

    /** Shown foliage clusters out of every cluster the stage authors. */
    const filled = (foliage: number, stage: 'mature_tree' | 'final_form') => {
      const art = SIGNATURE_STAGES.find((entry) => entry.stage === stage)!;
      const layers = [art.foliage.back, art.foliage.main, art.foliage.front];
      return foliage / layers.reduce((sum, l) => sum + l.core.length + l.extra.length, 0);
    };

    it('B is fuller and balanced for its size', () => {
      expect(filled(B.foliage, 'mature_tree')).toBeGreaterThan(0.75);
      expect(B.traits).toBe(2);
    });

    it('C is large but less full for its size than B', () => {
      expect(C.area).toBeGreaterThan(B.area);
      expect(filled(C.foliage, 'final_form')).toBeLessThan(filled(B.foliage, 'mature_tree'));
      expect(C.foliage).toBeLessThan(D.foliage);
    });

    it('D is the largest, fullest, and richest', () => {
      expect(D.area).toBe(C.area);
      expect(D.foliage).toBeGreaterThan(C.foliage);
      expect(D.blossoms).toBeGreaterThan(B.blossoms);
      expect(D.rich).toBeGreaterThan(C.rich);
      expect(D.traits).toBeGreaterThan(B.traits);
    });
  });

  it('draws every stage fixture', () => {
    for (const dto of Object.values(STAGE_FIXTURES)) {
      expect(() => composeTree(toTreeVisualState(dto))).not.toThrow();
    }
  });
});
