import { badgeArt } from '../badge-art';

/**
 * ART.2 Badge art (docs/10 §2 → Badges): one frame per category, one emblem per badge family,
 * rarity as a material, readable at ~48 px; an unknown id, category, or rarity never fails.
 */

/** The seeded catalog (focus-forest-api migrations): artworkId, category, rarity. */
const CATALOG = [
  ['first-session', 'focus', 'common'],
  ['focus-hours-10', 'focus', 'common'],
  ['focus-hours-50', 'focus', 'common'],
  ['focus-hours-100', 'focus', 'rare'],
  ['focus-hours-500', 'focus', 'legendary'],
  ['focus-streak-3', 'consistency', 'common'],
  ['focus-streak-7', 'consistency', 'common'],
  ['focus-streak-30', 'consistency', 'rare'],
  ['focus-streak-100', 'consistency', 'legendary'],
  ['early-bird', 'time_based', 'common'],
  ['night-owl', 'time_based', 'common'],
  ['weekend-warrior', 'time_based', 'common'],
  ['focus-together-first', 'social', 'common'],
  ['focus-buddy', 'social', 'common'],
] as const;

const art = ([artworkId, category, rarity]: readonly [string, string, string]) =>
  badgeArt({ artworkId, category, rarity });

describe('badge art (ART.2)', () => {
  it('gives each category its own frame', () => {
    const frames = ['focus', 'consistency', 'time_based', 'social', 'event', 'rare'].map(
      (category) => badgeArt({ artworkId: 'x', category, rarity: 'common' }).frameKind,
    );
    expect(new Set(frames).size).toBe(6);
  });

  it('draws every seeded badge with its own emblem, never the fallback leaf', () => {
    for (const entry of CATALOG) expect(art(entry).emblem).not.toBe('leaf');
    const families = new Set(CATALOG.map((entry) => art(entry).emblem));
    expect(families.size).toBe(8);
  });

  it('tells the tiers of one family apart (more rings, more stones)', () => {
    const parts = (id: string, category: string) =>
      badgeArt({ artworkId: id, category, rarity: 'common' }).parts.length;
    expect(parts('focus-hours-50', 'focus')).toBeGreaterThan(parts('focus-hours-10', 'focus'));
    expect(parts('focus-hours-500', 'focus')).toBeGreaterThan(parts('focus-hours-100', 'focus'));
    expect(parts('focus-streak-7', 'consistency')).toBeGreaterThan(
      parts('focus-streak-3', 'consistency'),
    );
    expect(parts('focus-streak-100', 'consistency')).toBeGreaterThan(
      parts('focus-streak-30', 'consistency'),
    );
  });

  it('shows rarity as a material: matte, then gold, then gold with a soft glow', () => {
    const [common, rare, legendary] = ['common', 'rare', 'legendary'].map((rarity) =>
      badgeArt({ artworkId: 'first-session', category: 'focus', rarity }),
    );
    expect(common!.halo).toBe(false);
    expect(rare!.halo).toBe(false);
    expect(legendary!.halo).toBe(true);
    expect(rare!.ring.color).not.toBe(common!.ring.color);
    expect(legendary!.ring.width).toBeGreaterThan(common!.ring.width);
  });

  it('draws unknown content plainly instead of failing (docs/07 §5)', () => {
    const unknown = badgeArt({ artworkId: 'spring-2027', category: 'mystery', rarity: 'mythic' });
    expect(unknown.frameKind).toBe('circle');
    expect(unknown.emblem).toBe('leaf');
    expect(unknown.halo).toBe(false);
    expect(badgeArt({ artworkId: 'lantern-night', category: 'event', rarity: 'rare' }).emblem).toBe(
      'ribbon',
    );
    expect(badgeArt({ artworkId: 'moonlit', category: 'rare', rarity: 'legendary' }).emblem).toBe(
      'seed',
    );
  });

  it('stays readable at 48 px: no stroke thinner than 1 px there, nothing outside the frame', () => {
    for (const entry of CATALOG) {
      for (const part of art(entry).parts) {
        if (part.strokeWidth !== undefined) expect(part.strokeWidth / 2).toBeGreaterThanOrEqual(1);
        for (const n of (part.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)) {
          expect(Math.abs(n)).toBeLessThanOrEqual(96);
        }
      }
    }
  });
});
