import type { Achievement, EarnedBadge, ProgressionResult } from '../api/progression';

/**
 * What the app says about progression (M4.1), from the server's answers only. Nothing here
 * decides whether something was earned: it phrases what an action's stored result says, and the
 * progress the server reports.
 */

/** The unlock of one or more actions: at most one badge revealed, the rest in one line. */
export interface UnlockMoment {
  /** The badge shown with its reveal (docs/04 → Badge unlock), or null when no badge came. */
  featured: EarnedBadge | null;
  /** The moment in words, shown and announced with or without motion. */
  caption: string;
  /** Everything else, in one line of text (docs/02 Session completion, step 4). */
  line: string | null;
}

const RARITY_RANK: Record<string, number> = { common: 1, rare: 2, legendary: 3 };
const rank = (rarity: string) => RARITY_RANK[rarity] ?? 0;

/**
 * The unlock moment of the given results, in the order the actions happened. The rarest badge
 * is featured (a rarity this version does not know ranks below common; ties keep the order
 * received); the other badges, the species, and the cosmetics are named in one line. An item
 * reported twice is named once. Null when nothing was unlocked or the results are unknown.
 */
export function unlockMoment(
  results: readonly (ProgressionResult | null | undefined)[],
): UnlockMoment | null {
  const known = results.filter((result): result is ProgressionResult => !!result);
  const badges = uniqueById(known.flatMap((result) => result.newlyEarnedBadges));
  const species = uniqueById(known.flatMap((result) => result.newlyUnlockedSpecies));
  const cosmetics = uniqueById(known.flatMap((result) => result.newlyUnlockedCosmetics));

  const featured = badges.reduce<EarnedBadge | null>(
    (best, badge) => (best === null || rank(badge.rarity) > rank(best.rarity) ? badge : best),
    null,
  );
  const named = [
    ...badges.filter((badge) => badge !== featured).map((badge) => `the ${badge.name} badge`),
    ...species.map((item) => `the ${item.name}${/\btree$/i.test(item.name) ? '' : ' tree'}`),
    ...cosmetics.map((item) => item.name),
  ];

  if (featured) {
    return {
      featured,
      caption: `New badge: ${featured.name}`,
      line: named.length > 0 ? `Also unlocked: ${listOf(named)}.` : null,
    };
  }
  if (named.length === 0) return null;
  return { featured: null, caption: `Unlocked: ${listOf(named)}.`, line: null };
}

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

/** Hours floored to one decimal: progress is never rounded up toward a target. */
function hours(minutes: number): string {
  const tenths = Math.floor((minutes / 60) * 10);
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

/**
 * The server's progress as a fraction (docs/01: "32 / 50 h"): minutes in hours, sessions and
 * days as whole numbers, a unit this version does not know as bare numbers. Null when the
 * achievement keeps its progress hidden (First Session).
 */
export function progressText(
  achievement: Pick<Achievement, 'progressVisible' | 'unit' | 'current' | 'target'>,
): string | null {
  if (!achievement.progressVisible) return null;
  const { unit, current, target } = achievement;
  switch (unit) {
    case 'minutes':
      return `${hours(current)} / ${hours(target)} h`;
    case 'sessions':
      return `${current} / ${target} ${plural(target, 'session')}`;
    case 'days':
      return `${current} / ${target} ${plural(target, 'day')}`;
    default:
      return `${current} / ${target}`;
  }
}

/** How full the bar is: the server's count toward its target, never past it. */
export function progressRatio(achievement: Pick<Achievement, 'current' | 'target'>): number {
  return Math.min(1, achievement.current / achievement.target);
}

/** The spec's badge categories (§9.1), in the order the app shows them. */
const CATEGORIES: readonly (readonly [string, string])[] = [
  ['focus', 'Focus'],
  ['consistency', 'Consistency'],
  ['time_based', 'Time of day'],
  ['social', 'Social'],
  ['event', 'Events'],
  ['rare', 'Rare'],
];

export function categoryLabel(category: string): string {
  return CATEGORIES.find(([id]) => id === category)?.[1] ?? 'Other';
}

export interface BadgeSection {
  title: string;
  badges: EarnedBadge[];
}

/**
 * Owned badges grouped by category in the spec's order, then any category this version does
 * not know as "Other"; within a section, the server's order (earned order).
 */
export function badgeSections(badges: readonly EarnedBadge[]): BadgeSection[] {
  const known = CATEGORIES.map(([id, title]) => ({
    title,
    badges: badges.filter((badge) => badge.category === id),
  }));
  const other = badges.filter((badge) => !CATEGORIES.some(([id]) => id === badge.category));
  return [...known, { title: 'Other', badges: other }].filter((s) => s.badges.length > 0);
}
