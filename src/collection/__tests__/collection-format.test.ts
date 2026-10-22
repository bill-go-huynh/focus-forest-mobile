import { collectionSchema, type CollectionItem } from '../../api/collection';
import {
  achievementHint,
  cosmeticItem,
  FIRST_SESSION_ITEM,
  GOLDEN_SAKURA_ITEM,
  makeCollection,
  MEADOW_ITEM,
  MISTY_HILLS_ITEM,
  OAK_ITEM,
  SEVEN_DAYS_ITEM,
  SIGNATURE_ITEM,
  STONE_LANTERN_ITEM,
  TWIG_FRAME_ITEM,
} from '../../test-utils/collection';
import {
  equipPlace,
  equipSlotOf,
  hintOf,
  itemLabel,
  ownedLine,
  sectionCount,
  sectionTitle,
} from '../collection-format';

const FOMO = /hurry|only \d|last chance|left|miss|before it|%|ends soon|don't/i;

describe('Collection Book wording (M4.3)', () => {
  it('names the three sections and counts what is shown, never a percentage', () => {
    const sections = collectionSchema.parse(makeCollection()).sections;
    expect(sections.map((s) => sectionTitle(s.kind))).toEqual([
      'Trees',
      'Badges',
      'Garden and profile',
    ]);
    expect(sections.map(sectionCount)).toEqual([
      '2 of 3 in your collection',
      '1 of 2 in your collection',
      '4 of 5 in your collection',
    ]);
    // Counted from the items the app shows, so the line always matches the grid.
    expect(sectionCount({ ...sections[0]!, owned: 9, total: 9 })).toBe('2 of 3 in your collection');
  });

  it('labels a locked item as not yet collected, an owned one by its name', () => {
    expect(itemLabel(OAK_ITEM)).toBe('Oak');
    expect(itemLabel(GOLDEN_SAKURA_ITEM)).toBe('Golden Sakura, not yet in your collection');
  });

  it('phrases the server’s hint, with progress floored and in the achievement’s unit', () => {
    expect(hintOf(MISTY_HILLS_ITEM)).toEqual({
      text: 'Comes with the 100 Hours badge: Focus for 100 hours in total.',
      progress: '32.5 / 100 h',
      ratio: 0.325,
      label: '100 Hours',
    });
    expect(hintOf(SEVEN_DAYS_ITEM)).toMatchObject({ progress: '3 / 7 days' });
    expect(
      hintOf({ ...GOLDEN_SAKURA_ITEM, unlock: achievementHint({ current: null }) }),
    ).toMatchObject({ progress: null });
    expect(hintOf({ ...GOLDEN_SAKURA_ITEM, unlock: { type: 'season' } })).toMatchObject({
      text: 'Comes with a season.',
    });
    expect(hintOf({ ...GOLDEN_SAKURA_ITEM, unlock: null })).toBeNull();
    expect(hintOf(OAK_ITEM)).toBeNull();
  });

  it('says how an owned item is held, and that a limited one stays', () => {
    expect(ownedLine(SIGNATURE_ITEM)).toBe('Part of every forest.');
    expect(ownedLine(OAK_ITEM)).toBe('In your collection.');
    const limited: CollectionItem = {
      ...STONE_LANTERN_ITEM,
      availability: { ...STONE_LANTERN_ITEM.availability, limited: true, obtainableNow: false },
    };
    expect(ownedLine(limited)).toBe('In your collection. A limited reward, yours to keep.');
    expect(ownedLine(GOLDEN_SAKURA_ITEM)).toBeNull();
  });

  it('never words a hint or a count with urgency', () => {
    const items = [GOLDEN_SAKURA_ITEM, SEVEN_DAYS_ITEM, MISTY_HILLS_ITEM];
    for (const item of items) expect(hintOf(item)?.text).not.toMatch(FOMO);
    const limitedLocked: CollectionItem = {
      ...MISTY_HILLS_ITEM,
      availability: {
        ...MISTY_HILLS_ITEM.availability,
        limited: true,
        availableUntil: '2026-10-31T00:00:00.000Z',
      },
    };
    expect(JSON.stringify(hintOf(limitedLocked))).not.toMatch(FOMO);
    expect(JSON.stringify(hintOf(limitedLocked))).not.toMatch(/2026|October|until/);
  });

  it('offers a slot only for an owned cosmetic the app can draw', () => {
    expect(equipSlotOf(MEADOW_ITEM)).toBe('background');
    expect(equipSlotOf(STONE_LANTERN_ITEM)).toBe('decoration');
    expect(equipSlotOf(TWIG_FRAME_ITEM)).toBe('profile_frame');
    expect(equipSlotOf(MISTY_HILLS_ITEM)).toBeNull(); // locked
    expect(
      equipSlotOf(cosmeticItem({ id: 'robin', type: 'fauna', artworkId: 'robin' })),
    ).toBeNull();
    expect(equipSlotOf(cosmeticItem({ id: 'aurora', type: 'background' }))).toBeNull(); // no art
    expect(equipSlotOf(cosmeticItem({ id: 'gold-frame', type: 'profile_frame' }))).toBeNull();
    expect(equipSlotOf(OAK_ITEM)).toBeNull();
    expect(equipSlotOf(FIRST_SESSION_ITEM)).toBeNull();
  });

  it('names where a cosmetic is used', () => {
    expect(equipPlace('background')).toBe('garden');
    expect(equipPlace('decoration')).toBe('garden');
    expect(equipPlace('profile_frame')).toBe('profile');
  });
});
