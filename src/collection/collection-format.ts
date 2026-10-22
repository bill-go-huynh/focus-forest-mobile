import type { CollectionItem, CollectionSection, EquipmentSlot } from '../api';
import { progressRatio, progressText } from '../progression/unlocks';
import { KNOWN_BACKGROUNDS, KNOWN_DECORATIONS, KNOWN_PROFILE_FRAMES } from '../tree/environment';

/**
 * What the Collection Book says (M4.3; docs/02: a naturalist's journal, honest hints, no FOMO
 * language). Everything is phrased from the server's answer: ownership, hints, and progress are
 * never decided here. No percentages, no countdowns, no availability dates on a locked item.
 */

const SECTION_TITLES: Record<CollectionSection['kind'], string> = {
  species: 'Trees',
  badges: 'Badges',
  cosmetics: 'Garden and profile',
};

export function sectionTitle(kind: CollectionSection['kind']): string {
  return SECTION_TITLES[kind];
}

/** Counted from the items shown, so the line always matches the grid below it. */
export function sectionCount(section: CollectionSection): string {
  const owned = section.items.filter((item) => item.owned).length;
  return `${owned} of ${section.items.length} in your collection`;
}

/** What a screen reader reads for an item in the grid. */
export function itemLabel(item: CollectionItem): string {
  return item.owned ? item.name : `${item.name}, not yet in your collection`;
}

export interface HintText {
  text: string;
  /** The server's progress in the achievement's unit ("32.5 / 100 h"), when it shows one. */
  progress: string | null;
  ratio: number;
  /** What the progress bar is named after. */
  label: string;
}

/** A locked item's hint, as the server structured it; null when there is none to phrase. */
export function hintOf(item: CollectionItem): HintText | null {
  if (item.owned || !item.unlock) return null;
  const hint = item.unlock;
  switch (hint.type) {
    case 'achievement': {
      const shown = {
        progressVisible: hint.current !== null,
        unit: hint.unit,
        current: hint.current ?? 0,
        target: hint.target,
      };
      return {
        text: `Comes with the ${hint.name} badge: ${hint.description}`,
        progress: progressText(shown),
        ratio: progressRatio(shown),
        label: hint.name,
      };
    }
    case 'season':
      return { text: 'Comes with a season.', progress: null, ratio: 0, label: item.name };
  }
}

/** How an owned item is held; a limited one is said to stay (spec §17.3). */
export function ownedLine(item: CollectionItem): string | null {
  if (!item.owned) return null;
  const held =
    item.source === 'system' && item.ownedAt === null
      ? 'Part of every forest.'
      : 'In your collection.';
  return item.availability.limited ? `${held} A limited reward, yours to keep.` : held;
}

const DRAWN: Partial<Record<EquipmentSlot, readonly string[]>> = {
  background: KNOWN_BACKGROUNDS,
  decoration: KNOWN_DECORATIONS,
  profile_frame: KNOWN_PROFILE_FRAMES,
};

/**
 * The slot an item can be used in: an owned cosmetic whose type is a slot the app draws, with
 * art the app has. Anything else (a locked one, fauna or weather before their art, an id this
 * version cannot draw: the renderer draws cosmetics by id) offers nothing to use.
 */
export function equipSlotOf(item: CollectionItem): EquipmentSlot | null {
  if (item.kind !== 'cosmetic' || !item.owned) return null;
  const slot = Object.keys(DRAWN).find((key) => key === item.type) as EquipmentSlot | undefined;
  if (!slot || !DRAWN[slot]!.includes(item.id)) return null;
  return slot;
}

/** Where a slot shows: the garden around this month's tree, or the profile. */
export function equipPlace(slot: EquipmentSlot): 'garden' | 'profile' {
  return slot === 'profile_frame' ? 'profile' : 'garden';
}
