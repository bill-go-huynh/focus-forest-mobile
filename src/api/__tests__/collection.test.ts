import {
  achievementHint,
  cosmeticItem,
  GOLDEN_SAKURA_ITEM,
  makeCollection,
  STONE_LANTERN_ITEM,
} from '../../test-utils/collection';
import type { ApiClient } from '../client';
import { collectionSchema, getCollection } from '../collection';

describe('the Collection Book contract (A4.4)', () => {
  it('reads the three sections, owned and locked items, and the server’s hints', () => {
    const parsed = collectionSchema.parse(makeCollection());
    expect(parsed.sections.map((s) => [s.kind, s.owned, s.total])).toEqual([
      ['species', 2, 3],
      ['badges', 1, 2],
      ['cosmetics', 4, 5],
    ]);
    const golden = parsed.sections[0]!.items.find((item) => item.id === 'golden-sakura');
    expect(golden).toMatchObject({ owned: false, unlock: { type: 'achievement', target: 30000 } });
  });

  it('keeps a hint with hidden progress and a season hint; an event hint (removed) reads as none', () => {
    const hidden = { ...GOLDEN_SAKURA_ITEM, unlock: achievementHint({ current: null }) };
    const event = {
      ...GOLDEN_SAKURA_ITEM,
      id: 'lantern-festival',
      unlock: { type: 'event' } as never,
    };
    const season = { ...GOLDEN_SAKURA_ITEM, id: 'winter', unlock: { type: 'season' as const } };
    const parsed = collectionSchema.parse(makeCollection({ species: [hidden, event, season] }));
    expect(parsed.sections[0]!.items.map((item) => item.unlock)).toEqual([
      expect.objectContaining({ current: null }),
      null,
      { type: 'season' },
    ]);
  });

  it('leaves out a section or an item kind this version does not know, and reads unknown strings', () => {
    const answer = makeCollection({
      cosmetics: [
        cosmeticItem({ id: 'aurora', type: 'sky', rarity: 'mythic' }),
        STONE_LANTERN_ITEM,
      ],
    }) as { sections: unknown[] };
    answer.sections.push({ kind: 'events', owned: 0, total: 0, items: [] });
    (answer.sections[1] as { items: unknown[] }).items.push({ kind: 'sticker', id: 'x' });
    const parsed = collectionSchema.parse(answer);
    expect(parsed.sections.map((s) => s.kind)).toEqual(['species', 'badges', 'cosmetics']);
    expect(parsed.sections[1]!.items.map((item) => item.id)).toEqual(['first-session', 'streak-7']);
    expect(parsed.sections[2]!.items.map((item) => item.id)).toEqual(['aurora', 'stone-lantern']);
    // A hint type this version cannot phrase is read as no hint, never a failure.
    const later = makeCollection({
      species: [{ ...GOLDEN_SAKURA_ITEM, unlock: { type: 'challenge' } as never }],
    });
    expect(collectionSchema.parse(later).sections[0]!.items[0]!.unlock).toBeNull();
  });

  it('refuses a malformed known item', () => {
    const broken = makeCollection({ species: [{ ...GOLDEN_SAKURA_ITEM, owned: 'no' as never }] });
    expect(collectionSchema.safeParse(broken).success).toBe(false);
  });

  it('reads GET /me/collection', async () => {
    const calls: string[] = [];
    const client = {
      request: jest.fn(
        async (path: string, options: { schema: { parse: (v: unknown) => unknown } }) => {
          calls.push(path);
          return options.schema.parse(makeCollection());
        },
      ),
    } as unknown as ApiClient;
    await getCollection(client);
    expect(calls).toEqual(['/me/collection']);
  });
});
