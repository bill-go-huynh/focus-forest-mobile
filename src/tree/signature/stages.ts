import type { TreeStage } from '../tree-contract';

/**
 * The signature species (docs/03 §9: a broad-leaf, rounded, oak-like tree), authored as seven
 * complete compositions with fixed slots (docs/03 §7–8). Fullness and blossom level choose how
 * many slots are filled, in the order listed here; the variation seed only offsets slots and
 * picks among authored alternatives. There is no anchor engine and no procedural placement.
 *
 * PLACEHOLDER ART (docs/10 §4, stage 1): simple vector shapes in the real layer structure.
 * Production art replaces the shapes behind the same stages, slots, and decorations.
 *
 * Coordinates are in the scene's view box (240 × 288, ground line at y = 252, trunk centered
 * on x = 120). The art leaves room inside `bounds` for the seed's offsets (at most 4.5 across,
 * 1.5 up or down), so a tree never grows or shrinks with its seed.
 */

export const signatureArtStatus = 'placeholder' as const;

export const TREE_VIEWBOX = { width: 240, height: 288 } as const;
export const GROUND_Y = 252;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShapeArt {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Degrees. */
  rotation?: number;
}

export interface BranchArt {
  path: string;
  width: number;
}

/** Slots shown at every fullness (`core`) and slots fullness reveals in order (`extra`). */
export interface SlotSet<T> {
  core: readonly T[];
  extra: readonly T[];
}

/**
 * Simple static milestone decorations (docs/03 §7 layer 13). Each sits in one authored slot per
 * stage; `trait-decorations.ts` maps trait identifiers onto them.
 */
export const DECORATIONS = [
  'hanging-bloom',
  'songbird-nest',
  'vine-ribbon',
  'lantern-flower',
  'seedpod',
  'heartwood-ring',
  'golden-leaf',
] as const;

export type Decoration = (typeof DECORATIONS)[number];

/** Where a decoration sits: in the canopy (moves with it), on the trunk, or on the ground. */
export type DecorationAnchor = 'canopy' | 'trunk' | 'ground';

export interface DecorationSlot extends Point {
  anchor: DecorationAnchor;
}

export interface StageArt {
  stage: TreeStage;
  /** Everything the tree draws stays inside: the stage's size, which nothing else changes. */
  bounds: Rect;
  /** Where the canopy sways from (near the top of the trunk). */
  pivot: Point;
  mound: ShapeArt;
  /** The seed itself (Seed only). */
  seed: ShapeArt | null;
  /** Root hint or root flare, as a stroked path. */
  roots: string | null;
  /** The trunk (or the sprout's stem) as a filled path; it never moves. */
  trunk: string | null;
  branches: SlotSet<BranchArt>;
  foliage: {
    back: SlotSet<ShapeArt>;
    main: SlotSet<ShapeArt>;
    front: SlotSet<ShapeArt>;
    /** Secondary clusters from richness tier 1 (docs/03 §5). */
    richness: readonly ShapeArt[];
  };
  /** Main core clusters drawn in the bloom expression's warm leaf tint (Blooming, Final Form). */
  accentClusters: readonly number[];
  blossomSlots: readonly Point[];
  /** Authored orders in which blossom slots fill; the seed picks one. */
  blossomOrders: readonly (readonly number[])[];
  blossomRadius: number;
  fruitSlots: readonly Point[];
  traitSlots: Record<Decoration, DecorationSlot>;
  particleSlots: readonly Point[];
}

const ellipse = (cx: number, cy: number, rx: number, ry = rx, rotation?: number): ShapeArt =>
  rotation === undefined ? { cx, cy, rx, ry } : { cx, cy, rx, ry, rotation };
const point = (x: number, y: number): Point => ({ x, y });
const branch = (path: string, width: number): BranchArt => ({ path, width });
const slot = (x: number, y: number, anchor: DecorationAnchor): DecorationSlot => ({ x, y, anchor });

/** Three authored fill orders: as listed, alternating halves, and reversed. */
function blossomOrders(count: number): number[][] {
  const listed = Array.from({ length: count }, (_, i) => i);
  const evens = listed.filter((i) => i % 2 === 0);
  const odds = listed.filter((i) => i % 2 === 1);
  return [listed, [...evens, ...odds], [...listed].reverse()];
}

/** Decorations before the tree has branches: small details around the mound. */
function groundDecorations(): Record<Decoration, DecorationSlot> {
  return {
    'hanging-bloom': slot(90, 246, 'ground'),
    'songbird-nest': slot(150, 246, 'ground'),
    'vine-ribbon': slot(80, 252, 'ground'),
    'lantern-flower': slot(160, 252, 'ground'),
    seedpod: slot(100, 254, 'ground'),
    'heartwood-ring': slot(140, 254, 'ground'),
    'golden-leaf': slot(120, 256, 'ground'),
  };
}

const NONE = { core: [], extra: [] } as const;

const seed: StageArt = {
  stage: 'seed',
  bounds: { x: 74, y: 228, width: 92, height: 34 },
  pivot: point(120, 246),
  mound: ellipse(120, 252, 46, 13),
  seed: ellipse(120, 243, 8, 6, -20),
  roots: 'M118 248 Q114 254 108 257 M122 248 Q125 253 130 255',
  trunk: null,
  branches: NONE,
  foliage: { back: NONE, main: NONE, front: NONE, richness: [] },
  accentClusters: [],
  blossomSlots: [],
  blossomOrders: [[]],
  blossomRadius: 0,
  fruitSlots: [],
  traitSlots: groundDecorations(),
  particleSlots: [
    point(96, 226),
    point(146, 220),
    point(120, 212),
    point(84, 236),
    point(156, 234),
    point(108, 218),
  ],
};

const sprout: StageArt = {
  stage: 'sprout',
  bounds: { x: 74, y: 192, width: 92, height: 70 },
  pivot: point(120, 210),
  mound: ellipse(120, 252, 42, 12),
  seed: null,
  roots: 'M117 250 Q113 255 108 257 M123 250 Q127 255 132 256',
  trunk: 'M118.5 250 C117.5 236 119 222 119 206 L121 206 C121.5 222 122.5 236 121.5 250 Z',
  branches: NONE,
  foliage: {
    back: NONE,
    // Two leaves, then up to four as the sprout fills in (docs/03 §3).
    main: {
      core: [ellipse(109, 212, 10, 5, -30), ellipse(131, 208, 10, 5, 30)],
      extra: [ellipse(110, 230, 8, 4, -25), ellipse(130, 226, 8, 4, 25)],
    },
    front: NONE,
    richness: [],
  },
  accentClusters: [],
  blossomSlots: [point(120, 201), point(126, 214)],
  blossomOrders: blossomOrders(2),
  blossomRadius: 2.5,
  fruitSlots: [],
  traitSlots: groundDecorations(),
  particleSlots: [
    point(96, 200),
    point(146, 196),
    point(120, 184),
    point(86, 222),
    point(156, 220),
    point(104, 190),
  ],
};

const youngTree: StageArt = {
  stage: 'young_tree',
  bounds: { x: 70, y: 92, width: 100, height: 160 },
  pivot: point(120, 190),
  mound: ellipse(120, 252, 44, 11),
  seed: null,
  roots: 'M108 252 Q114 248 116 244 M132 252 Q126 248 124 244',
  trunk: 'M114 252 C115 225 116 195 118 160 L122 160 C124 195 125 225 126 252 Z',
  branches: {
    core: [
      branch('M119 190 Q108 178 98 168', 2.5),
      branch('M121 182 Q132 170 142 162', 2.5),
      branch('M120 168 Q119 150 120 138', 2),
    ],
    extra: [branch('M119 205 Q104 196 94 192', 2), branch('M121 198 Q136 190 146 186', 2)],
  },
  foliage: {
    back: {
      core: [ellipse(108, 140, 18, 15), ellipse(134, 138, 18, 15)],
      extra: [ellipse(120, 112, 14, 11)],
    },
    main: {
      core: [
        ellipse(120, 128, 20, 17),
        ellipse(98, 150, 17, 14),
        ellipse(142, 146, 17, 14),
        ellipse(120, 154, 18, 14),
      ],
      extra: [
        ellipse(104, 128, 14, 12),
        ellipse(136, 126, 14, 12),
        ellipse(90, 170, 12, 10),
        ellipse(150, 166, 12, 10),
      ],
    },
    front: { core: [ellipse(126, 166, 12, 9)], extra: [ellipse(110, 170, 11, 8)] },
    richness: [],
  },
  accentClusters: [],
  blossomSlots: [point(112, 124), point(140, 140), point(100, 150), point(128, 158)],
  blossomOrders: blossomOrders(4),
  blossomRadius: 3,
  fruitSlots: [],
  traitSlots: {
    'hanging-bloom': slot(146, 172, 'canopy'),
    'songbird-nest': slot(98, 170, 'canopy'),
    'vine-ribbon': slot(120, 222, 'trunk'),
    'lantern-flower': slot(136, 178, 'canopy'),
    seedpod: slot(104, 176, 'canopy'),
    'heartwood-ring': slot(120, 238, 'trunk'),
    'golden-leaf': slot(120, 108, 'canopy'),
  },
  particleSlots: [
    point(80, 120),
    point(160, 114),
    point(120, 96),
    point(76, 160),
    point(166, 150),
    point(100, 104),
    point(142, 100),
  ],
};

const growingTree: StageArt = {
  stage: 'growing_tree',
  bounds: { x: 52, y: 80, width: 136, height: 172 },
  pivot: point(120, 186),
  mound: ellipse(120, 252, 52, 12),
  seed: null,
  roots: 'M104 252 Q111 247 114 241 M136 252 Q129 247 126 241',
  trunk: 'M112 252 C113 220 115 180 117 140 L123 140 C125 180 127 220 128 252 Z',
  branches: {
    core: [
      branch('M118 190 Q100 176 86 166', 3),
      branch('M122 180 Q140 166 156 158', 3),
      branch('M119 160 Q106 146 98 134', 2.5),
      branch('M121 154 Q134 140 142 128', 2.5),
    ],
    extra: [branch('M118 205 Q98 198 84 196', 2), branch('M122 200 Q144 192 158 190', 2)],
  },
  foliage: {
    back: {
      core: [ellipse(102, 124, 20, 16), ellipse(140, 120, 20, 16), ellipse(120, 128, 22, 16)],
      extra: [ellipse(88, 146, 15, 12), ellipse(154, 142, 15, 12)],
    },
    main: {
      core: [
        ellipse(120, 112, 22, 18),
        ellipse(94, 134, 20, 16),
        ellipse(146, 130, 20, 16),
        ellipse(120, 142, 22, 17),
        ellipse(84, 160, 15, 12),
        ellipse(156, 156, 15, 12),
      ],
      extra: [
        ellipse(104, 118, 16, 13),
        ellipse(138, 114, 16, 13),
        ellipse(106, 152, 15, 12),
        ellipse(136, 150, 15, 12),
        ellipse(120, 96, 14, 11),
        ellipse(70, 150, 11, 9),
        ellipse(170, 148, 11, 9),
      ],
    },
    front: {
      core: [ellipse(128, 164, 14, 10), ellipse(108, 166, 12, 9)],
      extra: [ellipse(146, 170, 10, 8)],
    },
    richness: [],
  },
  accentClusters: [],
  blossomSlots: [
    point(108, 106),
    point(136, 104),
    point(92, 130),
    point(150, 126),
    point(120, 132),
    point(102, 154),
    point(140, 150),
  ],
  blossomOrders: blossomOrders(7),
  blossomRadius: 3.2,
  fruitSlots: [],
  traitSlots: {
    'hanging-bloom': slot(156, 168, 'canopy'),
    'songbird-nest': slot(88, 166, 'canopy'),
    'vine-ribbon': slot(120, 214, 'trunk'),
    'lantern-flower': slot(146, 178, 'canopy'),
    seedpod: slot(96, 176, 'canopy'),
    'heartwood-ring': slot(120, 232, 'trunk'),
    'golden-leaf': slot(120, 88, 'canopy'),
  },
  particleSlots: [
    point(64, 120),
    point(176, 112),
    point(120, 84),
    point(60, 168),
    point(180, 160),
    point(90, 92),
    point(150, 90),
  ],
};

const matureTree: StageArt = {
  stage: 'mature_tree',
  bounds: { x: 44, y: 62, width: 152, height: 190 },
  pivot: point(120, 180),
  mound: ellipse(120, 252, 58, 13),
  seed: null,
  roots: 'M100 252 Q108 246 112 238 M140 252 Q132 246 128 238 M114 252 Q116 248 117 244',
  trunk: 'M110 252 C111 216 114 170 116 128 L124 128 C126 170 129 216 130 252 Z',
  branches: {
    core: [
      branch('M117 186 Q96 170 76 160', 3.5),
      branch('M123 178 Q146 162 166 154', 3.5),
      branch('M118 152 Q100 136 88 120', 3),
      branch('M122 146 Q140 130 152 116', 3),
      branch('M120 132 Q119 112 120 96', 2.5),
    ],
    extra: [
      branch('M117 200 Q94 192 74 190', 2.5),
      branch('M123 196 Q148 188 168 186', 2.5),
      branch('M119 168 Q104 160 92 146', 2),
    ],
  },
  foliage: {
    back: {
      core: [
        ellipse(100, 104, 22, 18),
        ellipse(140, 102, 22, 18),
        ellipse(84, 126, 20, 16),
        ellipse(156, 124, 20, 16),
      ],
      extra: [ellipse(120, 80, 18, 14), ellipse(70, 146, 14, 11), ellipse(170, 144, 14, 11)],
    },
    main: {
      core: [
        ellipse(120, 92, 24, 19),
        ellipse(92, 112, 22, 18),
        ellipse(148, 110, 22, 18),
        ellipse(120, 124, 26, 20),
        ellipse(76, 138, 19, 15),
        ellipse(164, 136, 19, 15),
        ellipse(98, 150, 20, 15),
        ellipse(142, 148, 20, 15),
      ],
      extra: [
        ellipse(104, 98, 17, 14),
        ellipse(136, 96, 17, 14),
        ellipse(66, 120, 14, 11),
        ellipse(174, 118, 14, 11),
        ellipse(120, 150, 18, 13),
        ellipse(84, 160, 14, 10),
        ellipse(156, 160, 14, 10),
      ],
    },
    front: {
      core: [ellipse(130, 164, 15, 10), ellipse(106, 166, 14, 10)],
      extra: [ellipse(150, 172, 11, 8), ellipse(90, 170, 11, 8)],
    },
    richness: [],
  },
  accentClusters: [],
  blossomSlots: [
    point(106, 86),
    point(136, 84),
    point(84, 108),
    point(158, 104),
    point(120, 112),
    point(96, 136),
    point(146, 132),
    point(70, 130),
    point(170, 128),
  ],
  blossomOrders: blossomOrders(9),
  blossomRadius: 3.4,
  fruitSlots: [],
  traitSlots: {
    'hanging-bloom': slot(164, 162, 'canopy'),
    'songbird-nest': slot(78, 162, 'canopy'),
    'vine-ribbon': slot(120, 206, 'trunk'),
    'lantern-flower': slot(150, 180, 'canopy'),
    seedpod: slot(88, 178, 'canopy'),
    'heartwood-ring': slot(120, 226, 'trunk'),
    'golden-leaf': slot(120, 72, 'canopy'),
  },
  particleSlots: [
    point(56, 104),
    point(184, 98),
    point(120, 66),
    point(52, 160),
    point(188, 156),
    point(84, 76),
    point(156, 72),
  ],
};

const bloomingTree: StageArt = {
  stage: 'blooming_tree',
  bounds: { x: 38, y: 56, width: 164, height: 196 },
  pivot: point(120, 178),
  mound: ellipse(120, 252, 62, 13),
  seed: null,
  roots: 'M99 252 Q107 246 111 237 M141 252 Q133 246 129 237 M114 252 Q116 248 117 243',
  trunk: 'M110 252 C111 214 114 168 116 124 L124 124 C126 168 129 214 130 252 Z',
  branches: {
    core: [
      branch('M117 184 Q94 168 72 158', 3.5),
      branch('M123 176 Q148 160 170 152', 3.5),
      branch('M118 150 Q98 132 84 116', 3),
      branch('M122 144 Q142 126 156 112', 3),
      branch('M120 128 Q119 108 120 90', 2.5),
    ],
    extra: [
      branch('M117 198 Q92 190 70 188', 2.5),
      branch('M123 194 Q150 186 172 184', 2.5),
      branch('M119 166 Q102 158 88 144', 2),
    ],
  },
  foliage: {
    back: {
      core: [
        ellipse(98, 100, 23, 18),
        ellipse(142, 98, 23, 18),
        ellipse(80, 124, 21, 16),
        ellipse(160, 122, 21, 16),
      ],
      extra: [ellipse(120, 74, 19, 14), ellipse(64, 146, 14, 11), ellipse(176, 144, 14, 11)],
    },
    main: {
      core: [
        ellipse(120, 88, 25, 20),
        ellipse(90, 108, 23, 18),
        ellipse(150, 106, 23, 18),
        ellipse(120, 122, 27, 20),
        ellipse(72, 134, 20, 15),
        ellipse(168, 132, 20, 15),
        ellipse(96, 148, 21, 15),
        ellipse(144, 146, 21, 15),
      ],
      extra: [
        ellipse(104, 94, 17, 14),
        ellipse(138, 92, 17, 14),
        ellipse(60, 118, 14, 11),
        ellipse(180, 116, 14, 11),
        ellipse(120, 150, 18, 13),
        ellipse(80, 160, 14, 10),
        ellipse(160, 160, 14, 10),
      ],
    },
    front: {
      core: [ellipse(130, 162, 16, 10), ellipse(104, 164, 15, 10)],
      extra: [ellipse(152, 172, 11, 8), ellipse(88, 172, 11, 8)],
    },
    richness: [],
  },
  accentClusters: [1, 5, 6],
  blossomSlots: [
    point(104, 80),
    point(138, 78),
    point(82, 102),
    point(160, 100),
    point(120, 108),
    point(94, 130),
    point(148, 128),
    point(64, 126),
    point(176, 124),
    point(120, 138),
    point(108, 156),
    point(134, 154),
  ],
  blossomOrders: blossomOrders(12),
  blossomRadius: 3.5,
  fruitSlots: [],
  traitSlots: {
    'hanging-bloom': slot(168, 158, 'canopy'),
    'songbird-nest': slot(74, 160, 'canopy'),
    'vine-ribbon': slot(120, 204, 'trunk'),
    'lantern-flower': slot(156, 178, 'canopy'),
    seedpod: slot(86, 178, 'canopy'),
    'heartwood-ring': slot(120, 224, 'trunk'),
    'golden-leaf': slot(120, 66, 'canopy'),
  },
  particleSlots: [
    point(50, 100),
    point(190, 94),
    point(120, 60),
    point(46, 160),
    point(194, 154),
    point(80, 70),
    point(160, 66),
  ],
};

const finalForm: StageArt = {
  stage: 'final_form',
  bounds: { x: 26, y: 38, width: 188, height: 214 },
  pivot: point(120, 172),
  mound: ellipse(120, 252, 70, 14),
  seed: null,
  roots:
    'M96 252 Q106 245 110 234 M144 252 Q134 245 130 234 M112 252 Q115 247 116 242 M128 252 Q125 247 124 242',
  trunk: 'M108 252 C109 212 112 160 115 116 L125 116 C128 160 131 212 132 252 Z',
  branches: {
    core: [
      branch('M116 184 Q90 166 64 156', 4),
      branch('M124 176 Q150 158 176 150', 4),
      branch('M117 150 Q96 130 80 112', 3.5),
      branch('M123 144 Q144 124 160 108', 3.5),
      branch('M120 126 Q118 102 120 82', 3),
      branch('M118 166 Q102 150 90 140', 3),
    ],
    extra: [
      branch('M116 200 Q90 192 64 190', 3),
      branch('M124 196 Q152 188 176 188', 3),
      branch('M121 136 Q132 114 138 96', 2.5),
      branch('M119 140 Q106 118 100 100', 2.5),
    ],
  },
  foliage: {
    back: {
      core: [
        ellipse(98, 88, 24, 19),
        ellipse(142, 86, 24, 19),
        ellipse(76, 112, 22, 17),
        ellipse(164, 110, 22, 17),
        ellipse(120, 96, 26, 18),
      ],
      extra: [
        ellipse(56, 132, 17, 13),
        ellipse(184, 130, 17, 13),
        ellipse(104, 66, 16, 12),
        ellipse(136, 64, 16, 12),
      ],
    },
    main: {
      core: [
        ellipse(120, 78, 26, 20),
        ellipse(92, 96, 24, 19),
        ellipse(148, 94, 24, 19),
        ellipse(120, 112, 28, 21),
        ellipse(68, 122, 22, 17),
        ellipse(172, 120, 22, 17),
        ellipse(94, 138, 23, 17),
        ellipse(146, 136, 23, 17),
        ellipse(50, 146, 16, 12),
        ellipse(190, 144, 16, 12),
      ],
      extra: [
        ellipse(104, 84, 18, 14),
        ellipse(136, 82, 18, 14),
        ellipse(76, 104, 16, 13),
        ellipse(164, 102, 16, 13),
        ellipse(120, 140, 20, 14),
        ellipse(70, 156, 15, 11),
        ellipse(170, 156, 15, 11),
        ellipse(120, 62, 15, 11),
      ],
    },
    front: {
      core: [ellipse(132, 156, 17, 11), ellipse(106, 158, 16, 11), ellipse(158, 164, 13, 9)],
      extra: [ellipse(82, 166, 12, 9), ellipse(176, 168, 11, 8)],
    },
    richness: [
      ellipse(110, 100, 13, 10),
      ellipse(132, 128, 13, 10),
      ellipse(84, 124, 12, 9),
      ellipse(158, 126, 12, 9),
      ellipse(120, 90, 12, 9),
      ellipse(100, 146, 12, 9),
    ],
  },
  accentClusters: [1, 5, 6, 9],
  blossomSlots: [
    point(104, 70),
    point(138, 68),
    point(80, 92),
    point(162, 90),
    point(120, 98),
    point(92, 120),
    point(150, 118),
    point(62, 116),
    point(180, 114),
    point(120, 130),
    point(106, 150),
    point(136, 148),
    point(48, 140),
    point(192, 138),
  ],
  blossomOrders: blossomOrders(14),
  blossomRadius: 3.6,
  fruitSlots: [
    point(88, 146),
    point(152, 144),
    point(116, 152),
    point(70, 130),
    point(172, 128),
    point(132, 108),
  ],
  traitSlots: {
    'hanging-bloom': slot(176, 154, 'canopy'),
    'songbird-nest': slot(66, 158, 'canopy'),
    'vine-ribbon': slot(120, 200, 'trunk'),
    'lantern-flower': slot(160, 174, 'canopy'),
    seedpod: slot(82, 174, 'canopy'),
    'heartwood-ring': slot(120, 222, 'trunk'),
    'golden-leaf': slot(120, 52, 'canopy'),
  },
  particleSlots: [
    point(38, 100),
    point(202, 94),
    point(120, 42),
    point(34, 170),
    point(206, 166),
    point(70, 56),
    point(170, 52),
    point(120, 186),
  ],
};

/** The seven stages, Seed first. */
export const SIGNATURE_STAGES: readonly StageArt[] = [
  seed,
  sprout,
  youngTree,
  growingTree,
  matureTree,
  bloomingTree,
  finalForm,
];

export function stageArt(stage: TreeStage): StageArt {
  return SIGNATURE_STAGES.find((art) => art.stage === stage) ?? seed;
}
