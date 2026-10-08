import {
  stageArt,
  TREE_VIEWBOX,
  type Decoration,
  type DecorationAnchor,
  type Point,
  type Rect,
  type ShapeArt,
  type SlotSet,
} from './signature/stages';
import { traitLook } from './signature/trait-decorations';
import {
  reshapePath,
  reshapePoint,
  speciesDefinition,
  type BloomExpression,
  type FruitShape,
  type SpeciesEffect,
  type SpeciesKey,
} from './species';
import type { TreeStage } from './tree-contract';
import { pick } from './variation';
import type { TreeVisualState, VisualLevel } from './visual-state';

/**
 * What to draw for one tree: the stage's authored composition with the slots its levels fill,
 * offset by its variation seed (docs/03 §7–8). Pure and deterministic: the same state always
 * gives the same composition. Vitality and lighting are not inputs, so they can never change
 * what the tree has earned; they live in the ambient layer (`scene.ts`).
 */

export interface Ellipse {
  key: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation: number;
}

export interface Cluster extends Ellipse {
  /** Drawn in the bloom expression's warm leaf tint. */
  accent: boolean;
}

export interface Dot {
  key: string;
  cx: number;
  cy: number;
  r: number;
}

export interface Branch {
  key: string;
  path: string;
  width: number;
}

export interface TraitMark {
  key: string;
  decoration: Decoration;
  /** The trait ids this decoration stands for. */
  traitIds: string[];
  x: number;
  y: number;
  size: number;
  anchor: DecorationAnchor;
}

export interface TreeComposition {
  stage: TreeStage;
  /** The species drawn (docs/03 §9), and how it expresses blossoms, fruit, and particles. */
  species: SpeciesKey;
  bloom: BloomExpression;
  fruitShape: FruitShape;
  particle: 'pollen' | 'petal';
  /** A rare variant's effect: presentation only, never an earned layer. */
  effect: SpeciesEffect | null;
  viewBox: typeof TREE_VIEWBOX;
  /** Paths (roots, trunk, branches) are drawn mirrored; shapes and points already are. */
  mirrored: boolean;
  /** One of the species palette's authored foliage tints. */
  tint: number;
  bounds: Rect;
  pivot: Point;
  mound: Ellipse;
  seed: Ellipse | null;
  roots: string | null;
  trunk: string | null;
  branches: Branch[];
  foliage: { back: Cluster[]; main: Cluster[]; front: Cluster[]; richness: Cluster[] };
  /** Sun-touched leaf edges (richness tier 3). */
  highlights: Ellipse[];
  blossoms: Dot[];
  fruit: Dot[];
  traits: TraitMark[];
  /** Soft glow behind the canopy (richness tier 4). */
  glow: { cx: number; cy: number; r: number } | null;
  /** Fireflies at night (richness tier 5). */
  fireflies: boolean;
  /** The renderer's richness tier, 0 to `RICHNESS_TIERS`. */
  richnessTier: number;
  particleSlots: Point[];
}

/** Richness tiers the renderer authors (docs/03 §5); a server tier is scaled onto them. */
export const RICHNESS_TIERS = 5;

/** Restrained seed offsets: a slight lean of the canopy and a small shift per slot. */
const LEANS = [-2.5, 0, 2.5] as const;
const NUDGES: readonly (readonly [number, number])[] = [
  [0, 0],
  [1.5, -1],
  [-1.5, 1],
  [1, 1.5],
  [-1, -1.5],
  [2, 0],
  [-2, 0],
];
const TINTS = [0, 1, 2] as const;
const TRAIT_SIZE = { canopy: 6, trunk: 6, ground: 5 } as const;
const FRUIT_RADIUS = 3.5;

export function composeTree(tree: TreeVisualState): TreeComposition {
  const art = stageArt(tree.stage);
  const species = speciesDefinition(tree.species);
  const form = species.shape;
  const { seed } = tree;
  const mirrored = pick(seed, 'mirror', [false, true]);
  // The seed's offsets shrink with a narrower or shorter species, so it never leaves its bounds.
  const sway = { x: Math.min(1, form.width), y: Math.min(1, form.height) };
  // Small details (blossoms, fruit, traits) shrink with it too: their room inside the bounds does.
  const detail = Math.min(sway.x, sway.y);
  const lean = pick(seed, 'lean', LEANS) * sway.x;
  const mirrorX = (x: number) => (mirrored ? TREE_VIEWBOX.width - x : x);
  /** A point of the signature's art, in this species' silhouette. */
  const reshape = (point: Point) => reshapePoint(form, point, art.bounds.height);

  /** A canopy slot, reshaped for the species, nudged by the seed, then mirrored. */
  const place = (key: string, shape: ShapeArt, accent = false): Cluster => {
    const [dx, dy] = pick(seed, `nudge:${key}`, NUDGES);
    const rotation = shape.rotation ?? 0;
    const at = reshape({ x: shape.cx, y: shape.cy });
    return {
      key,
      cx: mirrorX(at.x + lean + dx * sway.x),
      cy: at.y + dy * sway.y,
      rx: shape.rx * form.width * form.cluster.x,
      ry: shape.ry * form.height * form.cluster.y,
      rotation: mirrored ? -rotation : rotation,
      accent,
    };
  };
  const placeLayer = (layer: string, slots: SlotSet<ShapeArt>, accents: readonly number[] = []) =>
    filled(slots, tree.fullness).map((shape, i) =>
      place(`${layer}-${i}`, shape, accents.includes(i)),
    );

  const main = placeLayer('main', art.foliage.main, art.accentClusters);
  const richnessTier = authoredTier(tree.richness);

  const order = pick(seed, 'blossoms', art.blossomOrders);
  const blossoms = order.slice(0, blossomCount(tree.blossoms, art.blossomSlots.length)).map((i) => {
    const at = place(`blossom-${i}`, {
      cx: art.blossomSlots[i]!.x,
      cy: art.blossomSlots[i]!.y,
      rx: 0,
      ry: 0,
    });
    return { key: at.key, cx: at.cx, cy: at.cy, r: art.blossomRadius * detail };
  });

  const fruit =
    richnessTier >= 2
      ? art.fruitSlots.map((slot, i) => {
          const at = place(`fruit-${i}`, { cx: slot.x, cy: slot.y, rx: 0, ry: 0 });
          return { key: at.key, cx: at.cx, cy: at.cy, r: FRUIT_RADIUS * detail };
        })
      : [];

  const shaped = reshapeBounds(art.bounds, reshape);
  const bounds: Rect = {
    ...shaped,
    x: mirrored ? TREE_VIEWBOX.width - shaped.x - shaped.width : shaped.x,
  };
  const pivot = reshape(art.pivot);

  return {
    stage: art.stage,
    species: species.key,
    bloom: species.bloom,
    fruitShape: species.fruit,
    particle: species.particle,
    effect: species.effect,
    viewBox: TREE_VIEWBOX,
    mirrored,
    tint: pick(seed, 'tint', TINTS),
    bounds,
    pivot: { x: mirrorX(pivot.x), y: pivot.y },
    mound: unplaced('mound', art.mound),
    seed: art.seed
      ? {
          ...unplaced('seed', art.seed),
          cx: mirrorX(art.seed.cx),
          rotation: (mirrored ? -1 : 1) * (art.seed.rotation ?? 0),
        }
      : null,
    roots: art.roots ? reshapePath(form, art.roots, art.bounds.height, form.trunk) : null,
    trunk: art.trunk ? reshapePath(form, art.trunk, art.bounds.height, form.trunk) : null,
    branches: filled(art.branches, tree.fullness).map((b, i) => ({
      key: `branch-${i}`,
      path: reshapePath(form, b.path, art.bounds.height),
      width: b.width,
    })),
    foliage: {
      back: placeLayer('back', art.foliage.back),
      main,
      front: placeLayer('front', art.foliage.front),
      richness:
        richnessTier >= 1 ? art.foliage.richness.map((shape, i) => place(`rich-${i}`, shape)) : [],
    },
    highlights: richnessTier >= 3 ? main.map(highlight) : [],
    blossoms,
    fruit,
    traits: traitMarks(tree, art.traitSlots, lean, mirrorX, reshape, detail),
    glow:
      richnessTier >= 4
        ? {
            cx: TREE_VIEWBOX.width / 2,
            cy: bounds.y + bounds.height * 0.35,
            r: bounds.width * 0.55,
          }
        : null,
    fireflies: richnessTier >= 5,
    richnessTier,
    particleSlots: art.particleSlots.map((p) => ({ x: mirrorX(p.x), y: p.y })),
  };
}

/** Core slots always; extra slots in authored order as the level fills. */
function filled<T>(slots: SlotSet<T>, level: VisualLevel): T[] {
  return [...slots.core, ...slots.extra.slice(0, Math.round(level.ratio * slots.extra.length))];
}

/** None at level 0, at least one from level 1, every slot at the top level. */
function blossomCount(level: VisualLevel, slots: number): number {
  if (level.level === 0 || slots === 0) return 0;
  return Math.min(slots, Math.max(1, Math.round(level.ratio * slots)));
}

function authoredTier(richness: VisualLevel): number {
  if (richness.level === 0 || richness.ratio === 0) return 0;
  return Math.min(RICHNESS_TIERS, Math.max(1, Math.round(richness.ratio * RICHNESS_TIERS)));
}

/** A lighter patch toward the upper left of a cluster: the key light never moves. */
function highlight(cluster: Cluster): Ellipse {
  return {
    key: `${cluster.key}-light`,
    cx: cluster.cx - cluster.rx * 0.28,
    cy: cluster.cy - cluster.ry * 0.32,
    rx: cluster.rx * 0.42,
    ry: cluster.ry * 0.34,
    rotation: cluster.rotation,
  };
}

function unplaced(key: string, shape: ShapeArt): Ellipse {
  return {
    key,
    cx: shape.cx,
    cy: shape.cy,
    rx: shape.rx,
    ry: shape.ry,
    rotation: shape.rotation ?? 0,
  };
}

/** The stage's bounds in a species' silhouette: its widest at the ground, its height scaled. */
function reshapeBounds(bounds: Rect, reshape: (point: Point) => Point): Rect {
  const base = bounds.y + bounds.height;
  const left = reshape({ x: bounds.x, y: base });
  const right = reshape({ x: bounds.x + bounds.width, y: base });
  const top = reshape({ x: bounds.x, y: bounds.y });
  const bottom = reshape({ x: bounds.x, y: base });
  return { x: left.x, y: top.y, width: right.x - left.x, height: bottom.y - top.y };
}

function traitMarks(
  tree: TreeVisualState,
  slots: ReturnType<typeof stageArt>['traitSlots'],
  lean: number,
  mirrorX: (x: number) => number,
  reshape: (point: Point) => Point,
  detail: number,
): TraitMark[] {
  const marks = new Map<Decoration, TraitMark>();
  for (const trait of tree.traits) {
    const look = traitLook(trait);
    if (!look) continue;
    const existing = marks.get(look.decoration);
    if (existing) {
      existing.traitIds.push(trait.id);
      continue;
    }
    const authored = slots[look.decoration];
    const slot = { ...authored, ...reshape(authored) };
    marks.set(look.decoration, {
      key: `trait-${look.decoration}`,
      decoration: look.decoration,
      traitIds: [trait.id],
      x: mirrorX(slot.x + (slot.anchor === 'canopy' ? lean : 0)),
      y: slot.y,
      size: TRAIT_SIZE[slot.anchor] * detail,
      anchor: slot.anchor,
    });
  }
  return [...marks.values()];
}
