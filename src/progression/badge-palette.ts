/**
 * Badge art colors (ART.2): badges are illustrations, so like the tree they use their own
 * palette, not UI tokens (docs/01 §2). This is the only file in badge art with raw colors.
 * PROVISIONAL: direction B (painterly-flat) as on the art direction canvas; final when the owner
 * passes the badge set through the art quality gate (docs/10 §4).
 *
 * Rules the values keep: one muted hue family per category; rarity is a material (a matte ring,
 * a gold ring, gold with a soft glow), never gaudy or loot-box shine (docs/01 §1).
 */

export interface BadgeFamilyColors {
  soil: string;
  stem: string;
  leaf: string;
  leafLight: string;
  wood: string;
  woodLight: string;
  ring: string;
  stone: string;
  sun: string;
  ray: string;
  hill: string;
  moon: string;
  star: string;
  day: string;
  glow: string;
  ribbon: string;
  ribbonShade: string;
  petal: string;
  gem: string;
  gemLight: string;
  spark: string;
}

export const BADGE_PALETTE = {
  /** Each category's frame fill, lit from the upper left. */
  ground: {
    focus: ['#EAF2E0', '#AECB9B'],
    consistency: ['#F7ECD6', '#D8B77E'],
    time_based: ['#F8E4CC', '#E2A97F'],
    social: ['#E2ECEF', '#9DB9C6'],
    event: ['#F8E2E4', '#D99BA2'],
    rare: ['#ECE6F3', '#AFA3CC'],
  },
  ring: {
    common: { color: '#8A7F70', width: 2 },
    rare: { color: '#C9922E', width: 3.5 },
    legendary: { color: '#E3B54A', width: 4 },
  },
  /** A faint inner edge that catches the light. */
  edge: { color: '#FFFFFF', opacity: 0.35 },
  halo: { color: '#FFE9A8', opacity: 0.8 },
  emblem: {
    soil: '#8A6E52',
    stem: '#477A44',
    leaf: '#6FA463',
    leafLight: '#8DBA6A',
    wood: '#B98A5E',
    woodLight: '#E2C49B',
    ring: '#8E643F',
    stone: '#9C5B0C',
    sun: '#F0B44C',
    ray: '#C98E2C',
    hill: '#7E9666',
    moon: '#F2EDD5',
    star: '#FFF3C4',
    day: '#E59A82',
    glow: '#FFF0C7',
    ribbon: '#C96F5B',
    ribbonShade: '#B65F4D',
    petal: '#F6D5DE',
    gem: '#7D5A8C',
    gemLight: '#F2EDE3',
    spark: '#E3B54A',
  } satisfies BadgeFamilyColors,
} as const;
