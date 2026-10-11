import { SIGNATURE_PALETTE, type FoliageTint } from '../signature/palette';

/**
 * Species palettes (docs/03 §9: each species defines its palette; docs/10 §2: bark, foliage
 * ranges, bloom, fruit, glow tint) and the environment cosmetics' colors. With the signature
 * palette, the only files with raw colors in the renderer. PLACEHOLDER values until each
 * species passes the art quality gate (docs/10 §5); production art replaces them here.
 *
 * Rules the values keep: foliage stays alive in every tint (green, or a species' own warm leaf
 * color for a maple's bloom expression), never brown, grey, or wilted (docs/03 §6).
 */

export interface SpeciesPalette {
  bark: string;
  roots: string;
  seed: string;
  /** Three authored foliage tints; the variation seed picks one. */
  tints: readonly [FoliageTint, FoliageTint, FoliageTint];
  /** The bloom expression's warm leaf tint on accent clusters. */
  accent: string;
  highlight: string;
  /** The bloom expression's color: flowers, fresh tips, warm leaves, or buds. */
  blossom: string;
  blossomCenter: string;
  fruit: string;
  fruitCap: string;
  glow: string;
  /** Daytime particles: pollen, or a species' petals. */
  particle: string;
  /** A rare variant's effect color. */
  effect: string;
}

const signature: SpeciesPalette = {
  bark: SIGNATURE_PALETTE.bark,
  roots: SIGNATURE_PALETTE.roots,
  seed: SIGNATURE_PALETTE.seed,
  tints: SIGNATURE_PALETTE.tints,
  accent: SIGNATURE_PALETTE.accent,
  highlight: SIGNATURE_PALETTE.highlight,
  blossom: SIGNATURE_PALETTE.blossom,
  blossomCenter: SIGNATURE_PALETTE.blossomCenter,
  fruit: SIGNATURE_PALETTE.fruit,
  fruitCap: SIGNATURE_PALETTE.fruitCap,
  glow: SIGNATURE_PALETTE.glow,
  particle: SIGNATURE_PALETTE.pollen,
  effect: SIGNATURE_PALETTE.glow,
};

const sakura: SpeciesPalette = {
  bark: '#4E3B3A',
  roots: '#47353A',
  seed: '#8C6A5C',
  tints: [
    { back: '#7FA36B', main: '#93B87A', front: '#789E64' },
    { back: '#7AA070', main: '#8EB581', front: '#739A69' },
    { back: '#84A566', main: '#99BB74', front: '#7DA05F' },
  ],
  accent: '#C9D98A',
  highlight: '#D7E9A8',
  blossom: '#F2B8C8',
  blossomCenter: '#E58FA8',
  fruit: '#B6384A',
  fruitCap: '#5E7A3A',
  glow: '#FFE2EA',
  particle: '#F7CFDB',
  effect: '#F3C553',
};

const pine: SpeciesPalette = {
  bark: '#5C4636',
  roots: '#4F3C2F',
  seed: '#7F6347',
  tints: [
    { back: '#3F6E52', main: '#4D7F5E', front: '#3B684D' },
    { back: '#3C6B57', main: '#4A7C63', front: '#386551' },
    { back: '#43704D', main: '#52825A', front: '#3E6A48' },
  ],
  accent: '#7FAE7A',
  highlight: '#9CC39A',
  blossom: '#A8D18E',
  blossomCenter: '#7FB36A',
  fruit: '#8A6440',
  fruitCap: '#6B4D31',
  glow: '#E9F2D8',
  particle: SIGNATURE_PALETTE.pollen,
  effect: '#DCE8EE',
};

const maple: SpeciesPalette = {
  bark: '#5F4535',
  roots: '#553D30',
  seed: '#946F50',
  tints: [
    { back: '#6A9455', main: '#7CA662', front: '#648E50' },
    { back: '#70935A', main: '#82A568', front: '#698C53' },
    { back: '#6E9650', main: '#80A85D', front: '#678F4B' },
  ],
  accent: '#D98B45',
  highlight: '#E9C27A',
  blossom: '#D9643E',
  blossomCenter: '#B84A2E',
  fruit: '#C99A5B',
  fruitCap: '#9C7443',
  glow: '#FFE0B8',
  particle: '#E9A15F',
  effect: '#FFD08A',
};

const bonsai: SpeciesPalette = {
  bark: '#5A4A3E',
  roots: '#4E4035',
  seed: '#857058',
  tints: [
    { back: '#4F7F57', main: '#5E9064', front: '#4A7A52' },
    { back: '#4C7C5C', main: '#5B8D69', front: '#477656' },
    { back: '#537F52', main: '#62915F', front: '#4E7A4D' },
  ],
  accent: '#9DBF6E',
  highlight: '#B4D38C',
  blossom: '#F0E3C2',
  blossomCenter: '#D8C08A',
  fruit: '#A83E3E',
  fruitCap: '#5A6E3A',
  glow: '#F1EFD8',
  particle: SIGNATURE_PALETTE.pollen,
  effect: '#E8E2CC',
};

const fantasy: SpeciesPalette = {
  bark: '#4C4560',
  roots: '#433D55',
  seed: '#7C6F8C',
  tints: [
    { back: '#4F8C7E', main: '#5FA08F', front: '#4A8576' },
    { back: '#4B8786', main: '#5B9B99', front: '#46807F' },
    { back: '#548E76', main: '#64A286', front: '#4F8770' },
  ],
  accent: '#9FD3B8',
  highlight: '#B8E6D2',
  blossom: '#C7B6F0',
  blossomCenter: '#9E88DB',
  fruit: '#7FA7E0',
  fruitCap: '#5B6FA8',
  glow: '#D9F3FF',
  particle: '#D9EEFF',
  effect: '#9FE7FF',
};

const oak: SpeciesPalette = {
  ...signature,
  bark: '#634733',
  tints: [
    { back: '#5A8A52', main: '#6B9D5C', front: '#55864B' },
    { back: '#57875A', main: '#689B66', front: '#528455' },
    { back: '#5E8B4E', main: '#70A058', front: '#598749' },
  ],
  blossom: '#D9CF8F',
  blossomCenter: '#B9A75C',
  fruit: '#8E6436',
  fruitCap: '#6A4C2E',
};

/** Golden Sakura: the sakura's palette in warm gold light. */
const goldenSakura: SpeciesPalette = {
  ...sakura,
  blossom: '#F6D58A',
  blossomCenter: '#E8B44A',
  glow: '#FFEDB8',
  particle: '#F8E3A6',
  effect: '#F3C553',
};

/** Ancient Pine: an older, deeper pine touched with frost. */
const ancientPine: SpeciesPalette = {
  ...pine,
  bark: '#4A3B31',
  tints: [
    { back: '#365F4A', main: '#436F55', front: '#325A45' },
    { back: '#345D4E', main: '#416D5A', front: '#305848' },
    { back: '#3A6146', main: '#477152', front: '#355C42' },
  ],
  effect: '#E3EEF4',
};

export const SPECIES_PALETTES = {
  signature,
  oak,
  sakura,
  pine,
  maple,
  bonsai,
  fantasy,
  'golden-sakura': goldenSakura,
  'ancient-pine': ancientPine,
} as const satisfies Record<string, SpeciesPalette>;

/** Environment cosmetics (docs/03 §7 layers 2 and 17). */
export const ENVIRONMENT_PALETTE = {
  mist: '#F4F6F2',
  mistOpacity: 0.55,
  farHills: '#C8D6CE',
  stone: '#9A9890',
  stoneShade: '#7E7C75',
  moss: '#7E9F5E',
  lantern: '#A8A296',
  lanternLight: '#F6D58A',
  lanternLightOpacity: 0.5,
  frame: '#7A5A3E',
  frameLeaf: '#7FA36B',
} as const;

/**
 * Seasonal atmosphere overlays (docs/03 §10, M5.6): drawn around the scene, never on the tree.
 * Soft, low-opacity marks that keep text contrast (docs/11): overlays never sit over text.
 */
export const SEASONAL_PALETTE = {
  autumn: ['#D98A3C', '#C25E3A', '#E3B04B'],
  winter: ['#FFFFFF', '#EEF3F6'],
  sakura: ['#F2B8C6', '#F7D3DC'],
  rain: ['#8FA7B5'],
  night: ['#F6E27A'],
  summer: ['#FFF1C2'],
  markOpacity: 0.7,
  rayOpacity: 0.25,
} as const;
