import { GROUND_Y, TREE_VIEWBOX, type Point } from '../signature/stages';
import { SPECIES_PALETTES, type SpeciesPalette } from './palette';

/**
 * Species as visual definitions (docs/03 §9 → Shared framework): every species uses the same
 * seven stages, the same slots, and the same backend state; a species only says how they look.
 * Here a species reshapes the signature species' authored slots (its silhouette), and picks its
 * palette, bloom and fruit expressions, particles, and a rare variant's effect. It never adds,
 * removes, or reorders a slot, so it can never change what the tree earned.
 *
 * PROVISIONAL ART (ART.5): painted in direction B by the shared renderer; production art may
 * still replace the shapes behind the same slots (docs/10 §2, one art
 * set per species, each through the art quality gate). There is no anchor engine: no species
 * here needs one (docs/03 §8: generalize only when the complexity is real).
 */

export const SPECIES_KEYS = [
  'signature',
  'oak',
  'sakura',
  'pine',
  'maple',
  'bonsai',
  'fantasy',
  'golden-sakura',
  'ancient-pine',
] as const;
export type SpeciesKey = (typeof SPECIES_KEYS)[number];

/** How a species shows the blossoms dimension (docs/03 §9: each in its own idiom). */
export type BloomExpression = 'flowers' | 'tips' | 'leaf-shift' | 'buds';
export type FruitShape = 'acorn' | 'cherry' | 'cone' | 'samara' | 'berry';
/** A rare variant's look (docs/03 §9 → Rare trees): presentation only, off in thumbnails. */
export type SpeciesEffect = 'golden-light' | 'ancient-frost' | 'luminous';

export interface SpeciesShape {
  /** Horizontal scale around the trunk. */
  width: number;
  /** Vertical scale from the ground. */
  height: number;
  /** 0 keeps the width at every height; toward 1 the canopy narrows to a cone at the top. */
  taper: number;
  /** Extra scale of each foliage cluster (at most 1, so a species never outgrows its bounds). */
  cluster: { x: number; y: number };
  /** Extra horizontal scale of the trunk. */
  trunk: number;
}

export interface SpeciesDefinition {
  key: SpeciesKey;
  /** For the tree's description (English until localization). */
  name: string;
  /** A rare variant's base species. */
  base: SpeciesKey | null;
  shape: SpeciesShape;
  bloom: BloomExpression;
  fruit: FruitShape;
  particle: 'pollen' | 'petal';
  effect: SpeciesEffect | null;
  /**
   * Flowers drawn at each blossom slot, and their size: a sakura's dense pink blossoms
   * (docs/03 §9). The slot count still follows the blossom level, so the level stays legible.
   */
  bloomDensity?: { flowers: number; scale: number };
  palette: SpeciesPalette;
}

const IDENTITY: SpeciesShape = { width: 1, height: 1, taper: 0, cluster: { x: 1, y: 1 }, trunk: 1 };

const SAKURA_SHAPE: SpeciesShape = {
  width: 1.18,
  height: 0.9,
  taper: 0,
  cluster: { x: 0.9, y: 0.8 },
  trunk: 0.95,
};
const PINE_SHAPE: SpeciesShape = {
  width: 0.74,
  height: 1.08,
  taper: 0.55,
  cluster: { x: 0.9, y: 0.7 },
  trunk: 0.9,
};

const DEFINITIONS: Record<SpeciesKey, Omit<SpeciesDefinition, 'key' | 'palette'>> = {
  signature: {
    name: 'Signature',
    base: null,
    shape: IDENTITY,
    bloom: 'flowers',
    fruit: 'acorn',
    particle: 'pollen',
    effect: null,
  },
  oak: {
    name: 'Oak',
    base: null,
    shape: { width: 1.08, height: 0.96, taper: 0, cluster: { x: 1, y: 0.95 }, trunk: 1.15 },
    bloom: 'buds',
    fruit: 'acorn',
    particle: 'pollen',
    effect: null,
  },
  sakura: {
    name: 'Sakura',
    base: null,
    shape: SAKURA_SHAPE,
    bloom: 'flowers',
    fruit: 'cherry',
    particle: 'petal',
    effect: null,
    bloomDensity: { flowers: 3, scale: 1.2 },
  },
  pine: {
    name: 'Pine',
    base: null,
    shape: PINE_SHAPE,
    bloom: 'tips',
    fruit: 'cone',
    particle: 'pollen',
    effect: null,
  },
  maple: {
    name: 'Maple',
    base: null,
    shape: { width: 1.02, height: 1, taper: 0.12, cluster: { x: 0.95, y: 0.95 }, trunk: 1 },
    bloom: 'leaf-shift',
    fruit: 'samara',
    particle: 'petal',
    effect: null,
  },
  bonsai: {
    name: 'Bonsai',
    base: null,
    shape: { width: 1.06, height: 0.72, taper: 0, cluster: { x: 0.85, y: 0.75 }, trunk: 1.35 },
    bloom: 'buds',
    fruit: 'berry',
    particle: 'pollen',
    effect: null,
  },
  fantasy: {
    name: 'Fantasy Tree',
    base: null,
    shape: { width: 0.96, height: 1.06, taper: 0.15, cluster: { x: 0.95, y: 0.9 }, trunk: 0.9 },
    bloom: 'flowers',
    fruit: 'berry',
    particle: 'pollen',
    effect: 'luminous',
  },
  'golden-sakura': {
    name: 'Golden Sakura',
    base: 'sakura',
    shape: SAKURA_SHAPE,
    bloom: 'flowers',
    fruit: 'cherry',
    particle: 'petal',
    effect: 'golden-light',
    bloomDensity: { flowers: 3, scale: 1.2 },
  },
  'ancient-pine': {
    name: 'Ancient Pine',
    base: 'pine',
    shape: { ...PINE_SHAPE, width: 0.8, height: 1.1, trunk: 1.15 },
    bloom: 'tips',
    fruit: 'cone',
    particle: 'pollen',
    effect: 'ancient-frost',
  },
};

/** The species the renderer draws for an id the server sent; any other id is the signature. */
export function speciesKeyOf(id: string): SpeciesKey {
  return SPECIES_KEYS.find((key) => key === id) ?? 'signature';
}

export function speciesDefinition(key: SpeciesKey): SpeciesDefinition {
  return { key, ...DEFINITIONS[key], palette: SPECIES_PALETTES[key] };
}

/** The trunk's center line, which every species keeps in place. */
const AXIS_X = TREE_VIEWBOX.width / 2;

/**
 * Reshapes a point of the signature's art for a species: horizontally around the trunk's axis
 * (narrowing toward the top by `taper`, over the stage's `height`), vertically from the ground.
 * The identity shape returns the point unchanged.
 */
export function reshapePoint(shape: SpeciesShape, point: Point, stageHeight: number): Point {
  if (shape === IDENTITY) return point;
  const above = Math.max(0, GROUND_Y - point.y);
  const narrowing = stageHeight > 0 ? 1 - shape.taper * Math.min(1, above / stageHeight) : 1;
  return {
    x: AXIS_X + (point.x - AXIS_X) * shape.width * narrowing,
    y: GROUND_Y - above * shape.height,
  };
}

/** A path of absolute M/L/Q/T/C/S commands, every coordinate pair reshaped. */
export function reshapePath(
  shape: SpeciesShape,
  path: string,
  stageHeight: number,
  xScale = 1,
): string {
  if (shape === IDENTITY && xScale === 1) return path;
  const tokens = path.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  if (tokens.some((token) => /^[a-zA-Z]$/.test(token) && !/^[MLQTCSZ]$/.test(token))) {
    // Only absolute pair commands are authored; anything else is drawn as it is.
    return path;
  }
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    if (/^[A-Za-z]$/.test(token)) {
      out.push(token);
      continue;
    }
    const x = Number(token);
    const y = Number(tokens[i + 1]);
    i += 1;
    const at = reshapePoint(shape, { x: AXIS_X + (x - AXIS_X) * xScale, y }, stageHeight);
    out.push(`${round(at.x)} ${round(at.y)}`);
  }
  return out.join(' ');
}

const round = (value: number) => Math.round(value * 100) / 100;
