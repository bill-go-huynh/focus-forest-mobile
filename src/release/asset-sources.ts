/**
 * Where every shipped asset came from (docs/10 §4: "Keep a record of the source for every asset
 * (tool, date, prompt or artist, license) in an asset manifest"). An asset leaves `placeholder`
 * only with an entry here. Reference material (the art direction canvas in `design/`) is not
 * shipped and is not listed.
 */

export interface AssetSource {
  /** The `RELEASE_ASSETS` entry it belongs to. */
  asset: string;
  files: readonly string[];
  /** ISO date. */
  made: string;
  by: string;
  method: string;
  license: string;
}

const CLAUDE = 'Claude (Anthropic), with the owner directing (direction B chosen 2026-10-16)';
const ORIGINAL =
  'Original work for Focus Forest; no third-party, traced, or stock assets; not prompted to imitate any artist or app';

export const ASSET_SOURCES: readonly AssetSource[] = [
  {
    asset: 'signature-tree',
    files: [
      'src/tree/signature/stages.ts',
      'src/tree/signature/palette.ts',
      'src/tree/signature/brush.ts',
    ],
    made: '2026-10-16',
    by: CLAUDE,
    method:
      'Hand-authored SVG geometry and palette in code; organic outlines computed deterministically from the authored slots (design/art-direction/)',
    license: ORIGINAL,
  },
  {
    asset: 'signature-tree',
    files: ['assets/art/grain.png'],
    made: '2026-10-16',
    by: CLAUDE,
    method: 'Generated noise texture (design/tools/generate-grain.py, fixed seed)',
    license: ORIGINAL,
  },
  {
    asset: 'badges',
    files: [
      'src/progression/BadgeMark.tsx',
      'src/progression/badge-art.ts',
      'src/progression/badge-palette.ts',
    ],
    made: '2026-10-16',
    by: CLAUDE,
    method:
      'Hand-authored SVG frames per category and emblems per badge family (design/art-direction/Badges.dc.html)',
    license: ORIGINAL,
  },
  {
    asset: 'tab-icons',
    files: ['src/components/icons.tsx'],
    made: '2026-10-16',
    by: CLAUDE,
    method: 'Hand-authored SVG line icons on a 24-unit grid (docs/01 §5)',
    license: ORIGINAL,
  },
  {
    asset: 'topic-icons',
    files: ['src/components/TopicMark.tsx', 'src/components/topic-icons.ts'],
    made: '2026-10-16',
    by: CLAUDE,
    method: 'Hand-authored SVG line icons on a 24-unit grid (docs/01 §5), 50 in the curated set',
    license: ORIGINAL,
  },
  {
    asset: 'illustrations',
    files: ['src/components/illustrations.tsx'],
    made: '2026-10-16',
    by: CLAUDE,
    method: 'Hand-authored SVG spot scenes in theme colors with soft gradients (docs/10 §2)',
    license: ORIGINAL,
  },
  {
    asset: 'species',
    files: ['src/tree/species/index.ts', 'src/tree/species/palette.ts'],
    made: '2026-10-16',
    by: CLAUDE,
    method:
      'Species palettes tuned for depth through value; painted by the shared direction B renderer',
    license: ORIGINAL,
  },
  {
    asset: 'collection',
    files: ['src/collection/CollectionArt.tsx', 'src/species/FramedAvatar.tsx'],
    made: '2026-10-16',
    by: CLAUDE,
    method: 'Hand-authored SVG cosmetic vignettes and the twig profile frame',
    license: ORIGINAL,
  },
  {
    asset: 'community-tree',
    files: ['src/events/CommunityTreeScreen.tsx'],
    made: '2026-10-16',
    by: CLAUDE,
    method: 'The signature species in direction B on the shared renderer',
    license: ORIGINAL,
  },
];
