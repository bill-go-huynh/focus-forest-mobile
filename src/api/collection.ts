import { z } from 'zod';

import type { ApiClient } from './client';

/**
 * GET /me/collection (A4.4): the Collection Book, derived by the server on every read. Owned
 * items stay forever; an unowned item is listed only when it can really be obtained now, with a
 * structured hint. Rarity, source, status, category, and type are strings: later phases add
 * content (seasons) and an older app must still read it. Sections and item kinds this
 * version does not know are left out, a hint it cannot phrase is read as none.
 */

const instant = z.iso.datetime();
const count = z.number().int().nonnegative();

const KNOWN_SECTIONS = ['species', 'badges', 'cosmetics'] as const;
const KNOWN_ITEMS = ['species', 'badge', 'cosmetic'] as const;
const KNOWN_HINTS = ['achievement', 'season'] as const;

const isOneOf = (known: readonly string[]) => (value: string) => known.includes(value);

export const unlockHintSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('achievement'),
    achievementId: z.string(),
    /** The achievement's badge name and description: its user-facing copy. */
    name: z.string(),
    description: z.string(),
    unit: z.string(),
    target: z.number().int().positive(),
    /** Null when the achievement keeps its progress hidden. */
    current: count.nullable(),
  }),
  z.object({ type: z.literal('season') }),
]);
export type UnlockHint = z.infer<typeof unlockHintSchema>;

const futureHintSchema = z
  .object({ type: z.string().refine((type) => !isOneOf(KNOWN_HINTS)(type)) })
  .transform(() => null);

const itemBase = {
  id: z.string(),
  name: z.string(),
  description: z.string(),
  rarity: z.string(),
  owned: z.boolean(),
  /** When the ownership was stored; null for content everyone owns, and for locked items. */
  ownedAt: instant.nullable(),
  source: z.string(),
  availability: z.object({
    status: z.string(),
    limited: z.boolean(),
    availableFrom: instant.nullable(),
    availableUntil: instant.nullable(),
    /** A fact (it could be obtained now), never urgency. */
    obtainableNow: z.boolean(),
  }),
  /** How a locked item is obtained; null when owned or owned by everyone. */
  unlock: z.union([unlockHintSchema, futureHintSchema]).nullable(),
};

export const collectionItemSchema = z.discriminatedUnion('kind', [
  z.object({
    ...itemBase,
    kind: z.literal('species'),
    /** Species are drawn by their id. */
    artworkId: z.null(),
    baseSpeciesId: z.string().nullable(),
    /** The species of the current month's tree (or the one it will start with). */
    selected: z.boolean(),
  }),
  z.object({
    ...itemBase,
    kind: z.literal('badge'),
    artworkId: z.string(),
    category: z.string(),
    showcasePosition: count.nullable(),
  }),
  z.object({
    ...itemBase,
    kind: z.literal('cosmetic'),
    artworkId: z.string(),
    /** Also its equipment slot. */
    type: z.string(),
    equipped: z.boolean(),
  }),
]);
export type CollectionItem = z.infer<typeof collectionItemSchema>;
export type CollectionItemKind = CollectionItem['kind'];

const futureItemSchema = z.object({
  kind: z.string().refine((kind) => !isOneOf(KNOWN_ITEMS)(kind)),
});

export const collectionSectionSchema = z.object({
  kind: z.enum(KNOWN_SECTIONS),
  /** The server's counts of its visible items; the app counts what it shows instead. */
  owned: count,
  total: count,
  items: z
    .array(z.union([collectionItemSchema, futureItemSchema]))
    .transform((items) =>
      items.filter((item): item is CollectionItem => isOneOf(KNOWN_ITEMS)(item.kind)),
    ),
});
export type CollectionSection = z.infer<typeof collectionSectionSchema>;

const futureSectionSchema = z.object({
  kind: z.string().refine((kind) => !isOneOf(KNOWN_SECTIONS)(kind)),
});

export const collectionSchema = z.object({
  /** In the server's fixed product order. */
  sections: z
    .array(z.union([collectionSectionSchema, futureSectionSchema]))
    .transform((sections) =>
      sections.filter((section): section is CollectionSection =>
        isOneOf(KNOWN_SECTIONS)(section.kind),
      ),
    ),
});
export type Collection = z.infer<typeof collectionSchema>;

export function getCollection(client: ApiClient): Promise<Collection> {
  return client.request('/me/collection', { schema: collectionSchema });
}
