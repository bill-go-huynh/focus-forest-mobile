import type { Achievement, Badges, EarnedBadge, ProgressionResult } from '../api/progression';

/**
 * Phase 4 API answers shaped like the A4.2–A4.3 contracts (focus-forest-api
 * `src/progression/badge.dto.ts`): badges, achievements, the showcase, and the `progression`
 * an action caused. Every value is server truth.
 */

export const FIRST_SESSION: EarnedBadge = {
  id: 'first-session',
  name: 'First Session',
  description: 'Your first counted focus session.',
  category: 'focus',
  rarity: 'common',
  artworkId: 'first-session',
  earnedAt: '2026-10-07T09:30:00.000Z',
};

export const STREAK_7: EarnedBadge = {
  id: 'focus-streak:7',
  name: '7-Day Streak',
  description: 'Focused 7 days in a row.',
  category: 'consistency',
  rarity: 'common',
  artworkId: 'focus-streak-7',
  earnedAt: '2026-10-07T09:30:00.000Z',
};

export const HOURS_100: EarnedBadge = {
  id: 'focus-hours:100',
  name: '100 Hours',
  description: '100 hours of counted focus.',
  category: 'focus',
  rarity: 'rare',
  artworkId: 'focus-hours-100',
  earnedAt: '2026-10-07T09:30:00.000Z',
};

export function makeBadge(overrides: Partial<EarnedBadge> = {}): EarnedBadge {
  return { ...FIRST_SESSION, ...overrides };
}

export const NO_PROGRESSION: ProgressionResult = {
  newlyEarnedBadges: [],
  newlyUnlockedSpecies: [],
  newlyUnlockedCosmetics: [],
};

export function makeProgression(overrides: Partial<ProgressionResult> = {}): ProgressionResult {
  return { ...NO_PROGRESSION, ...overrides };
}

/** First Session with the Oak it unlocks (A4.3), as the first counted session answers it. */
export const FIRST_UNLOCKS: ProgressionResult = makeProgression({
  newlyEarnedBadges: [FIRST_SESSION],
  newlyUnlockedSpecies: [
    {
      id: 'oak',
      name: 'Oak',
      description: 'A sturdy oak, grown from your first focus session.',
      rarity: 'common',
      baseSpeciesId: null,
      unlockedAt: FIRST_SESSION.earnedAt,
    },
  ],
});

export function makeAchievement(
  badge: Omit<EarnedBadge, 'earnedAt'>,
  overrides: Partial<Achievement> = {},
): Achievement {
  const { id, name, description, category, rarity, artworkId } = badge;
  return {
    id,
    badge: { id, name, description, category, rarity, artworkId },
    unit: 'minutes',
    current: 0,
    target: 600,
    completed: false,
    earnedAt: null,
    progressVisible: true,
    ...overrides,
  };
}

export function makeBadges(items: EarnedBadge[] = [], showcase: EarnedBadge[] = []): Badges {
  return { items, showcase };
}
