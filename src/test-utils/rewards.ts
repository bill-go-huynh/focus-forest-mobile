import type { Cosmetic, Equipment, OwnedSpecies, SpeciesList } from '../api/progression';

/**
 * A4.3 answers (focus-forest-api `src/progression/badge.dto.ts`): owned species with whether
 * each can be chosen now, owned cosmetics, and the equipped garden. Every value is server truth.
 */

export const SIGNATURE: OwnedSpecies = {
  id: 'signature',
  name: 'Signature',
  description: 'The Focus Forest tree.',
  rarity: 'common',
  baseSpeciesId: null,
  selectable: true,
};

export const OAK: OwnedSpecies = {
  id: 'oak',
  name: 'Oak',
  description: 'A sturdy oak, grown from your first focus session.',
  rarity: 'common',
  baseSpeciesId: null,
  selectable: true,
};

export const SAKURA: OwnedSpecies = {
  id: 'sakura',
  name: 'Sakura',
  description: 'A cherry tree with arching branches.',
  rarity: 'common',
  baseSpeciesId: null,
  selectable: true,
};

export function makeSpeciesList(
  items: OwnedSpecies[] = [SIGNATURE],
  current: Partial<SpeciesList['current']> = {},
): SpeciesList {
  return {
    items,
    current: { year: 2026, month: 10, speciesId: 'signature', locked: false, ...current },
  };
}

export function makeCosmetic(overrides: Partial<Cosmetic> = {}): Cosmetic {
  return {
    id: 'meadow',
    name: 'Meadow',
    description: 'Soft green hills behind your forest.',
    type: 'background',
    rarity: 'common',
    artworkId: 'meadow',
    ...overrides,
  };
}

export const STONE_LANTERN = makeCosmetic({
  id: 'stone-lantern',
  name: 'Stone Lantern',
  description: 'A small stone lantern by the path.',
  type: 'decoration',
  artworkId: 'stone-lantern',
});

export const MISTY_HILLS = makeCosmetic({
  id: 'misty-hills',
  name: 'Misty Hills',
  description: 'Far hills in a morning mist.',
  rarity: 'rare',
  artworkId: 'misty-hills',
});

export const TWIG_FRAME = makeCosmetic({
  id: 'twig-frame',
  name: 'Twig Frame',
  description: 'A frame of woven twigs for your profile.',
  type: 'profile_frame',
  rarity: 'rare',
  artworkId: 'twig-frame',
});

export function makeEquipment(
  forest: Partial<Equipment['forest']> = {},
  profileFrame: Cosmetic | null = null,
): Equipment {
  return {
    forest: {
      background: null,
      decoration: null,
      fauna: null,
      weather: null,
      effect: null,
      ...forest,
    },
    profileFrame,
  };
}
