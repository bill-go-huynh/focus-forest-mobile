import { BADGE_PALETTE, type BadgeFamilyColors } from './badge-palette';

/**
 * Badge art (ART.2; docs/10 §2 → Badges: "a consistent frame system per category, a central
 * emblem in the illustration style, plus a rarity treatment (materials, glow), never gaudy;
 * readable at ~48px"). Direction B, painterly-flat, as on the art direction canvas. Pure data in
 * a 96 × 96 box: the component draws it at any size.
 *
 * The badge the server sends picks everything: its category the frame, its rarity the ring, its
 * `artworkId` the emblem. An unknown id draws its category's emblem, and an unknown category the
 * plain circle, so new content from the admin never fails (docs/07 §5).
 */

export const BADGE_VIEWBOX = 96;

export type FrameKind = 'circle' | 'square' | 'arch' | 'hex' | 'shield' | 'gem';

const FRAMES: Record<FrameKind, string> = {
  circle: 'M48 6 A42 42 0 1 1 47.9 6 Z',
  square: 'M26 8 H70 Q88 8 88 26 V70 Q88 88 70 88 H26 Q8 88 8 70 V26 Q8 8 26 8 Z',
  arch: 'M10 50 A38 38 0 0 1 86 50 V76 Q86 88 74 88 H22 Q10 88 10 76 Z',
  hex: 'M48 6 L85 27 V69 L48 90 L11 69 V27 Z',
  shield: 'M48 6 L84 18 V46 Q84 76 48 90 Q12 76 12 46 V18 Z',
  gem: 'M33 6 H63 L90 33 V63 L63 90 H33 L6 63 V33 Z',
};

const CATEGORY_FRAME: Record<string, FrameKind> = {
  focus: 'circle',
  consistency: 'square',
  time_based: 'arch',
  social: 'hex',
  event: 'shield',
  rare: 'gem',
};

/** One shape of an emblem: filled, or stroked with round ends. */
export interface EmblemPart {
  d: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface BadgeArt {
  frame: string;
  frameKind: FrameKind;
  /** The frame's fill, lit from the upper left. */
  ground: readonly [string, string];
  ring: { color: string; width: number };
  /** A soft glow behind a legendary badge. */
  halo: boolean;
  emblem: string;
  parts: readonly EmblemPart[];
}

const circle = (x: number, y: number, r: number) =>
  `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const fixed = (n: number) => Number(n.toFixed(1));

type Emblem = (c: BadgeFamilyColors, tier: number) => EmblemPart[];

const fill = (d: string, color: string, opacity?: number): EmblemPart =>
  opacity === undefined ? { d, fill: color } : { d, fill: color, opacity };
const line = (d: string, color: string, width = 3): EmblemPart => ({
  d,
  fill: 'none',
  stroke: color,
  strokeWidth: width,
});

/** A sprout in a small mound: the first session. */
const sprout: Emblem = (c) => [
  fill('M30 74 Q48 62 66 74 Z', c.soil),
  line('M48 70 C48 60 48 52 48 44', c.stem, 3.5),
  fill('M48 54 C40 54 33 48 33 39 C42 39 48 45 48 54 Z', c.leaf),
  fill('M48 47 C56 47 63 41 63 32 C54 32 48 38 48 47 Z', c.leafLight),
];

/** Growth rings in a cut log: more rings for more hours (tier 1–5). */
const rings: Emblem = (c, tier) => {
  const parts: EmblemPart[] = [
    fill(circle(48, 50, 26), c.wood),
    fill(circle(48, 50, 22), c.woodLight),
  ];
  for (let i = 0; i < tier; i += 1) {
    parts.push(line(circle(48 + i * 0.6, 50 - i * 0.4, 19 - i * 3.6), c.ring, 2.4));
  }
  parts.push(fill(circle(48 + tier * 0.6, 50 - tier * 0.4, 2.6), c.ring));
  return parts;
};

/** Stepping stones along a path, with a leaf: more stones for longer streaks. */
const stones: Emblem = (c, tier) => {
  const count = [3, 3, 7, 10, 12][Math.min(4, tier - 1)] ?? 7;
  const parts: EmblemPart[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = ((200 + (i * 140) / Math.max(1, count - 1)) * Math.PI) / 180;
    const r = count > 7 ? 3 : 3.8;
    parts.push(
      fill(
        circle(fixed(48 + 27 * Math.cos(a)), fixed(54 - 27 * Math.sin(a)), r),
        c.stone,
        0.6 + (0.4 * i) / count,
      ),
    );
  }
  parts.push(fill('M48 30 C41 35 41 44 48 50 C55 44 55 35 48 30 Z', c.leaf));
  parts.push(line('M48 50 V58', c.stem, 3));
  return parts;
};

/** The sun rising over a hill: sessions started before 07:00. */
const sunrise: Emblem = (c) => [
  fill(circle(48, 60, 13), c.sun),
  line('M48 36 V30', c.ray),
  line('M31 43 L27 39', c.ray),
  line('M65 43 L69 39', c.ray),
  fill('M12 76 Q48 54 84 76 V80 H12 Z', c.hill),
];

/** A crescent moon and three stars over the trees: sessions started at night. */
const moon: Emblem = (c) => [
  fill('M58 26 A20 20 0 1 0 66 58 A15 15 0 1 1 58 26 Z', c.moon),
  fill(circle(30, 30, 2.2), c.star),
  fill(circle(24, 46, 1.6), c.star),
  fill(circle(70, 24, 1.8), c.star),
  fill('M12 78 Q24 62 34 74 Q44 60 56 72 Q68 60 84 76 V80 H12 Z', c.hill),
];

/** Two days side by side, a sprout between them: both days of a weekend. */
const weekend: Emblem = (c) => [
  fill(circle(34, 46, 15), c.sun),
  fill(circle(62, 46, 15), c.day),
  line('M48 76 C48 68 48 62 48 56', c.stem, 3),
  fill('M48 64 C42 64 37 60 37 54 C43 54 48 58 48 64 Z', c.leaf),
  fill('M48 60 C54 60 59 56 59 50 C53 50 48 54 48 60 Z', c.leafLight),
];

/** Three sprouts in a row, the middle one taller: the first session focused together. */
const together: Emblem = (c) =>
  [30, 48, 66].flatMap((x, i) => {
    const top = i === 1 ? 48 : 54;
    return [
      line(`M${x} 74 C${x} 66 ${x} 60 ${x} ${top}`, c.stem, 3),
      fill(
        `M${x} ${top + 8} C${x - 7} ${top + 8} ${x - 11} ${top + 2} ${x - 11} ${top - 5} C${x - 4} ${top - 5} ${x} ${top} ${x} ${top + 8} Z`,
        i === 1 ? c.leafLight : c.leaf,
      ),
    ];
  });

/** Two leaves leaning together: focused with a friend. */
const pair: Emblem = (c) => [
  fill('M46 72 C30 68 25 50 33 35 C44 43 50 57 46 72 Z', c.leaf),
  fill('M50 72 C66 68 71 50 63 35 C52 43 46 57 50 72 Z', c.leafLight),
  fill(circle(48, 40, 4.5), c.glow),
];

/** A blossom on a tied ribbon: a seasonal keepsake. */
const ribbon: Emblem = (c) => [
  fill('M41 58 L36 78 L42 74 L46 80 L48 60 Z', c.ribbon),
  fill('M55 58 L60 78 L54 74 L50 80 L48 60 Z', c.ribbonShade),
  ...[0, 1, 2, 3, 4].map((i) => {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    return fill(circle(fixed(48 + 10 * Math.cos(a)), fixed(44 + 10 * Math.sin(a)), 7.5), c.petal);
  }),
  fill(circle(48, 44, 5), c.sun),
];

/** A glowing seed with a spark: something rare. */
const seed: Emblem = (c) => [
  fill(circle(48, 50, 22), c.glow, 0.55),
  fill('M48 30 C61 37 63 57 48 68 C33 57 35 37 48 30 Z', c.gem),
  line('M43 40 C45 37 49 37 51 40', c.gemLight, 2.4),
  fill('M70 24 L72 30 L78 32 L72 34 L70 40 L68 34 L62 32 L68 30 Z', c.spark),
];

/** A plain leaf: any badge whose art this app does not know. */
const leaf: Emblem = (c) => [
  fill('M48 72 C34 64 32 44 48 26 C64 44 62 64 48 72 Z', c.leaf),
  line('M48 70 L48 40', c.stem, 3),
];

const EMBLEMS = {
  sprout,
  rings,
  stones,
  sunrise,
  moon,
  weekend,
  together,
  pair,
  ribbon,
  seed,
  leaf,
};
export type EmblemKind = keyof typeof EMBLEMS;

/** Known artwork families (the seeded catalog; docs/06 Badge). */
function emblemFor(artworkId: string, category: string): { kind: EmblemKind; tier: number } {
  const tier = (thresholds: number[]) => {
    const n = Number(artworkId.split('-').at(-1));
    return Math.max(1, thresholds.filter((t) => n >= t).length);
  };
  if (artworkId === 'first-session') return { kind: 'sprout', tier: 1 };
  if (artworkId.startsWith('focus-hours-'))
    return { kind: 'rings', tier: tier([10, 50, 100, 500]) + 1 };
  if (artworkId.startsWith('focus-streak-'))
    return { kind: 'stones', tier: tier([3, 7, 30, 100]) + 1 };
  if (artworkId === 'early-bird') return { kind: 'sunrise', tier: 1 };
  if (artworkId === 'night-owl') return { kind: 'moon', tier: 1 };
  if (artworkId === 'weekend-warrior') return { kind: 'weekend', tier: 1 };
  if (artworkId === 'focus-together-first') return { kind: 'together', tier: 1 };
  if (artworkId === 'focus-buddy') return { kind: 'pair', tier: 1 };
  if (category === 'event') return { kind: 'ribbon', tier: 1 };
  if (category === 'rare') return { kind: 'seed', tier: 1 };
  return { kind: 'leaf', tier: 1 };
}

export function badgeArt(badge: { artworkId: string; category: string; rarity: string }): BadgeArt {
  const frameKind = CATEGORY_FRAME[badge.category] ?? 'circle';
  const ground =
    BADGE_PALETTE.ground[badge.category as keyof typeof BADGE_PALETTE.ground] ??
    BADGE_PALETTE.ground.focus;
  const ring =
    BADGE_PALETTE.ring[badge.rarity as keyof typeof BADGE_PALETTE.ring] ??
    BADGE_PALETTE.ring.common;
  const { kind, tier } = emblemFor(badge.artworkId, badge.category);
  return {
    frame: FRAMES[frameKind],
    frameKind,
    ground,
    ring,
    halo: badge.rarity === 'legendary',
    emblem: kind,
    parts: EMBLEMS[kind](BADGE_PALETTE.emblem, tier),
  };
}
