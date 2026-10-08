import type { Collection, CollectionItem, CollectionSection } from '../api/collection';

/**
 * A4.4 answers (focus-forest-api `src/progression/collection.service.ts`): the derived
 * Collection Book in three fixed sections, owned items with when they were stored, locked
 * items with the server's structured hint. Every value is server truth.
 */

const PERMANENT = {
  status: 'active',
  limited: false,
  availableFrom: null,
  availableUntil: null,
  obtainableNow: true,
};

type Kinded<K extends CollectionItem['kind']> = Extract<CollectionItem, { kind: K }>;

function base(id: string, name: string, description: string) {
  return {
    id,
    name,
    description,
    rarity: 'common',
    owned: true,
    ownedAt: null as string | null,
    source: 'system',
    availability: PERMANENT,
    unlock: null as CollectionItem['unlock'],
  };
}

export function speciesItem(overrides: Partial<Kinded<'species'>> = {}): Kinded<'species'> {
  return {
    ...base('signature', 'Signature', 'The Focus Forest tree.'),
    kind: 'species',
    artworkId: null,
    baseSpeciesId: null,
    selected: false,
    ...overrides,
  };
}

export function badgeItem(overrides: Partial<Kinded<'badge'>> = {}): Kinded<'badge'> {
  return {
    ...base('first-session', 'First Session', 'Your first counted focus session.'),
    kind: 'badge',
    source: 'achievement',
    ownedAt: '2026-10-02T08:00:00.000Z',
    artworkId: 'first-session',
    category: 'focus',
    showcasePosition: null,
    ...overrides,
  };
}

export function cosmeticItem(overrides: Partial<Kinded<'cosmetic'>> = {}): Kinded<'cosmetic'> {
  return {
    ...base('meadow', 'Meadow', 'Soft green hills behind your forest.'),
    kind: 'cosmetic',
    artworkId: 'meadow',
    type: 'background',
    equipped: false,
    ...overrides,
  };
}

/** A locked item's hint: the achievement's badge, its unit and target, and progress if shown. */
export function achievementHint(
  overrides: Partial<Extract<NonNullable<CollectionItem['unlock']>, { type: 'achievement' }>> = {},
): NonNullable<CollectionItem['unlock']> {
  return {
    type: 'achievement',
    achievementId: 'focus-hours:100',
    name: '100 Hours',
    description: 'Focus for 100 hours in total.',
    unit: 'minutes',
    target: 6000,
    current: 1950,
    ...overrides,
  };
}

export const SIGNATURE_ITEM = speciesItem({ selected: true });
export const OAK_ITEM = speciesItem({
  id: 'oak',
  name: 'Oak',
  description: 'A sturdy oak, grown from your first focus session.',
  source: 'achievement',
  ownedAt: '2026-10-02T08:00:00.000Z',
});
export const GOLDEN_SAKURA_ITEM = speciesItem({
  id: 'golden-sakura',
  name: 'Golden Sakura',
  description: 'A rare sakura with golden blossoms.',
  rarity: 'legendary',
  source: 'achievement',
  owned: false,
  baseSpeciesId: 'sakura',
  unlock: achievementHint({
    achievementId: 'focus-hours:500',
    name: '500 Hours',
    description: 'Focus for 500 hours in total.',
    target: 30000,
  }),
});
export const FIRST_SESSION_ITEM = badgeItem({ showcasePosition: 0 });
export const SEVEN_DAYS_ITEM = badgeItem({
  id: 'streak-7',
  name: '7-Day Streak',
  description: 'Focus seven days in a row.',
  category: 'consistency',
  owned: false,
  ownedAt: null,
  artworkId: 'streak-7',
  unlock: achievementHint({
    achievementId: 'focus-streak:7',
    name: '7-Day Streak',
    description: 'Focus seven days in a row.',
    unit: 'days',
    target: 7,
    current: 3,
  }),
});
export const MEADOW_ITEM = cosmeticItem();
export const MOSSY_STONES_ITEM = cosmeticItem({
  id: 'mossy-stones',
  name: 'Mossy Stones',
  description: 'A few quiet stones on the ground.',
  type: 'decoration',
  artworkId: 'mossy-stones',
});
export const STONE_LANTERN_ITEM = cosmeticItem({
  id: 'stone-lantern',
  name: 'Stone Lantern',
  description: 'A small stone lantern by the path.',
  type: 'decoration',
  artworkId: 'stone-lantern',
  source: 'achievement',
  ownedAt: '2026-10-05T08:00:00.000Z',
});
export const MISTY_HILLS_ITEM = cosmeticItem({
  id: 'misty-hills',
  name: 'Misty Hills',
  description: 'Far hills in a morning mist.',
  rarity: 'rare',
  artworkId: 'misty-hills',
  source: 'achievement',
  owned: false,
  unlock: achievementHint(),
});
export const TWIG_FRAME_ITEM = cosmeticItem({
  id: 'twig-frame',
  name: 'Twig Frame',
  description: 'A frame of woven twigs for your profile.',
  type: 'profile_frame',
  rarity: 'rare',
  artworkId: 'twig-frame',
  source: 'achievement',
  ownedAt: '2026-10-06T08:00:00.000Z',
});

function section(kind: CollectionSection['kind'], items: CollectionItem[]): CollectionSection {
  return { kind, owned: items.filter((item) => item.owned).length, total: items.length, items };
}

export function makeCollection(
  parts: {
    species?: CollectionItem[];
    badges?: CollectionItem[];
    cosmetics?: CollectionItem[];
  } = {},
): Collection {
  return {
    sections: [
      section('species', parts.species ?? [SIGNATURE_ITEM, OAK_ITEM, GOLDEN_SAKURA_ITEM]),
      section('badges', parts.badges ?? [FIRST_SESSION_ITEM, SEVEN_DAYS_ITEM]),
      section(
        'cosmetics',
        parts.cosmetics ?? [
          MEADOW_ITEM,
          MOSSY_STONES_ITEM,
          STONE_LANTERN_ITEM,
          MISTY_HILLS_ITEM,
          TWIG_FRAME_ITEM,
        ],
      ),
    ],
  };
}
