import { topicMarkStatus } from '../components/TopicMark';
import { tabIconStatus } from '../components/icons';
import { illustrationStatus } from '../components/illustrations';
import { badgeArtStatus } from '../progression/BadgeMark';
import { themeValueStatus } from '../theme/theme';
import { signatureArtStatus } from '../tree/signature/stages';

/**
 * R7.1 What still stands in for final art or values (docs/10 art quality gate; docs/12 Phase 20:
 * "no placeholder or unlicensed assets in the release build"). Owner decision 5: a beta may ship
 * with these, clearly listed; the public release waits for the art pass. Every file marked
 * PLACEHOLDER or PROVISIONAL belongs to one entry, so nothing stays a placeholder unseen.
 */

export type AssetStatus = 'placeholder' | 'provisional' | 'final';

export interface ReleaseAsset {
  id: string;
  /** What it is, for the release notes. */
  what: string;
  status: AssetStatus;
  /** The docs that decide it. */
  doc: string;
  files: readonly string[];
}

const illustrationStates = Object.values(illustrationStatus);
const illustrations: AssetStatus = illustrationStates.every((s) => s === 'final')
  ? 'final'
  : illustrationStates.some((s) => s === 'placeholder')
    ? 'placeholder'
    : 'provisional';
const theme: AssetStatus = Object.values(themeValueStatus).every((s) => s === ('final' as string))
  ? 'final'
  : 'provisional';

export const RELEASE_ASSETS: readonly ReleaseAsset[] = [
  {
    id: 'theme',
    what: 'Palette, typography, and easing values',
    status: theme,
    doc: 'docs/01 (Phase 0 decisions)',
    files: ['src/theme/colors.ts', 'src/theme/tokens.ts'],
  },
  {
    id: 'tab-icons',
    what: 'The tab bar icon family',
    status: tabIconStatus,
    doc: 'docs/01',
    files: ['src/components/icons.tsx'],
  },
  {
    id: 'topic-icons',
    what: 'The curated topic icon set',
    status: topicMarkStatus,
    doc: 'docs/01, docs/10',
    files: ['src/components/TopicMark.tsx'],
  },
  {
    id: 'illustrations',
    what: 'Spot illustrations for empty and error states',
    status: illustrations,
    doc: 'docs/10 §4',
    files: ['src/components/illustrations.tsx'],
  },
  {
    id: 'signature-tree',
    what: 'The signature tree art and its palette',
    status: signatureArtStatus,
    doc: 'docs/10 §3–§4',
    files: ['src/tree/signature/stages.ts', 'src/tree/signature/palette.ts'],
  },
  {
    id: 'species',
    what: 'Every other species’ art and palette',
    status: 'provisional',
    doc: 'docs/10 §2, §5',
    files: ['src/tree/species/index.ts', 'src/tree/species/palette.ts'],
  },
  {
    id: 'badges',
    what: 'Badge art',
    status: badgeArtStatus,
    doc: 'docs/10',
    files: ['src/progression/BadgeMark.tsx', 'src/progression/badge-palette.ts'],
  },
  {
    id: 'collection',
    what: 'Cosmetic marks, silhouettes, and profile frames',
    status: 'provisional',
    doc: 'docs/10',
    files: ['src/collection/CollectionArt.tsx', 'src/species/FramedAvatar.tsx'],
  },
  {
    id: 'community-tree',
    what: 'The Community Tree species',
    status: 'provisional',
    doc: 'docs/10',
    files: ['src/events/CommunityTreeScreen.tsx'],
  },
];

/** What a public release still waits for. */
export const releaseBlockers = (assets: readonly ReleaseAsset[] = RELEASE_ASSETS) =>
  assets.filter((asset) => asset.status !== 'final').map((asset) => asset.id);
