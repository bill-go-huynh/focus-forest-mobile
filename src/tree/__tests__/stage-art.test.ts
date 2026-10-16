import { SIGNATURE_STAGES, type ShapeArt, type StageArt } from '../signature/stages';

/**
 * ART.1 Believable branch logic (docs/01 §6, docs/10 §1): every branch ends inside the foliage
 * that is shown with it, so no bare stick pokes out of the canopy. A core branch ends in a core
 * cluster (shown at every fullness); an extra branch ends in any cluster of its stage.
 */

function tip(path: string) {
  const values = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  return { x: values[values.length - 2]!, y: values[values.length - 1]! };
}

const inside = (p: { x: number; y: number }, e: ShapeArt) =>
  ((p.x - e.cx) / e.rx) ** 2 + ((p.y - e.cy) / e.ry) ** 2 <= 0.8;

const clusters = (art: StageArt, which: 'core' | 'all') => {
  const { back, main, front } = art.foliage;
  const sets = [back, main, front];
  return sets.flatMap((set) => (which === 'core' ? set.core : [...set.core, ...set.extra]));
};

const trees = SIGNATURE_STAGES.filter((art) => art.branches.core.length > 0);

describe('signature stage art (ART.1)', () => {
  it.each(trees.map((art) => [art.stage, art] as const))(
    '%s: every core branch ends inside a core cluster',
    (_, art) => {
      for (const branch of art.branches.core) {
        expect({
          tip: tip(branch.path),
          inside: clusters(art, 'core').some((c) => inside(tip(branch.path), c)),
        }).toEqual({ tip: tip(branch.path), inside: true });
      }
    },
  );

  it.each(trees.map((art) => [art.stage, art] as const))(
    '%s: every extra branch ends inside a cluster',
    (_, art) => {
      for (const branch of art.branches.extra) {
        expect({
          tip: tip(branch.path),
          inside: clusters(art, 'all').some((c) => inside(tip(branch.path), c)),
        }).toEqual({ tip: tip(branch.path), inside: true });
      }
    },
  );
});
