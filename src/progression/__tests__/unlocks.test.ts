import {
  FIRST_SESSION,
  FIRST_UNLOCKS,
  HOURS_100,
  makeAchievement,
  makeBadge,
  makeProgression,
  NO_PROGRESSION,
  STREAK_7,
} from '../../test-utils/progression';
import {
  badgeSections,
  categoryLabel,
  progressRatio,
  progressText,
  unlockMoment,
} from '../unlocks';

const LEGENDARY = makeBadge({
  id: 'focus-hours:500',
  name: '500 Hours',
  rarity: 'legendary',
  artworkId: 'focus-hours-500',
});

describe('unlockMoment: one reveal, everything else in one line (docs/02, docs/04)', () => {
  it('reveals the badge an action earned, and names what it unlocked', () => {
    const moment = unlockMoment([FIRST_UNLOCKS]);
    expect(moment?.featured?.id).toBe('first-session');
    expect(moment?.caption).toBe('New badge: First Session');
    expect(moment?.line).toBe('Also unlocked: the Oak tree.');
  });

  it('features the rarest badge; ties keep the order received', () => {
    const moment = unlockMoment([
      makeProgression({ newlyEarnedBadges: [STREAK_7, HOURS_100] }),
      makeProgression({ newlyEarnedBadges: [LEGENDARY, FIRST_SESSION] }),
    ]);
    expect(moment?.featured?.id).toBe('focus-hours:500');
    expect(moment?.line).toBe(
      'Also unlocked: the 7-Day Streak badge, the 100 Hours badge, and the First Session badge.',
    );
    const tie = unlockMoment([makeProgression({ newlyEarnedBadges: [STREAK_7, FIRST_SESSION] })]);
    expect(tie?.featured?.id).toBe('focus-streak:7');
  });

  it('ranks a rarity it does not know below common', () => {
    const odd = makeBadge({ id: 'x', name: 'Odd', rarity: 'mythic' });
    expect(
      unlockMoment([makeProgression({ newlyEarnedBadges: [odd, STREAK_7] })])?.featured?.id,
    ).toBe('focus-streak:7');
  });

  it('names species and cosmetics in the same line', () => {
    const moment = unlockMoment([
      makeProgression({
        newlyEarnedBadges: [HOURS_100],
        newlyUnlockedSpecies: [
          { ...FIRST_UNLOCKS.newlyUnlockedSpecies[0]!, id: 'fantasy', name: 'Fantasy Tree' },
        ],
        newlyUnlockedCosmetics: [
          {
            id: 'misty-hills',
            name: 'Misty Hills',
            description: 'Far hills in a morning mist.',
            type: 'background',
            rarity: 'rare',
            artworkId: 'misty-hills',
            unlockedAt: HOURS_100.earnedAt,
          },
        ],
      }),
    ]);
    expect(moment?.line).toBe('Also unlocked: the Fantasy Tree and Misty Hills.');
  });

  it('is nothing for an action that unlocked nothing, or whose result is unknown', () => {
    expect(unlockMoment([NO_PROGRESSION])).toBeNull();
    expect(unlockMoment([null, undefined])).toBeNull();
    expect(unlockMoment([])).toBeNull();
  });

  it('lists rewards alone when no badge came with them', () => {
    const moment = unlockMoment([
      makeProgression({ newlyUnlockedSpecies: FIRST_UNLOCKS.newlyUnlockedSpecies }),
    ]);
    expect(moment).toEqual({ featured: null, caption: 'Unlocked: the Oak tree.', line: null });
  });

  it('never repeats an item reported twice', () => {
    const moment = unlockMoment([FIRST_UNLOCKS, FIRST_UNLOCKS]);
    expect(moment?.line).toBe('Also unlocked: the Oak tree.');
  });
});

describe('achievement progress, quietly (docs/01: "32 / 50 h")', () => {
  it('shows minutes as hours, floored to one decimal', () => {
    expect(progressText(makeAchievement(HOURS_100, { current: 1234, target: 6000 }))).toBe(
      '20.5 / 100 h',
    );
    expect(progressText(makeAchievement(HOURS_100, { current: 59, target: 600 }))).toBe(
      '0.9 / 10 h',
    );
  });

  it('shows sessions and days as whole numbers', () => {
    expect(progressText(makeAchievement(STREAK_7, { unit: 'days', current: 4, target: 7 }))).toBe(
      '4 / 7 days',
    );
    expect(
      progressText(makeAchievement(FIRST_SESSION, { unit: 'sessions', current: 0, target: 1 })),
    ).toBe('0 / 1 session');
  });

  it('shows weekends for Weekend Warrior (owner decision 2026-10-15)', () => {
    expect(
      progressText(makeAchievement(STREAK_7, { unit: 'weekends', current: 2, target: 4 })),
    ).toBe('2 / 4 weekends');
    expect(
      progressText(makeAchievement(STREAK_7, { unit: 'weekends', current: 0, target: 1 })),
    ).toBe('0 / 1 weekend');
  });

  it('shows bare numbers for a unit it does not know, and nothing when progress is hidden', () => {
    expect(
      progressText(makeAchievement(STREAK_7, { unit: 'weekdays', current: 2, target: 5 })),
    ).toBe('2 / 5');
    expect(progressText(makeAchievement(FIRST_SESSION, { progressVisible: false }))).toBeNull();
  });

  it('fills the bar up to the target, never past it', () => {
    expect(progressRatio(makeAchievement(HOURS_100, { current: 300, target: 600 }))).toBe(0.5);
    expect(progressRatio(makeAchievement(HOURS_100, { current: 900, target: 600 }))).toBe(1);
  });
});

describe('badges by category', () => {
  it('names each spec category, and anything else calmly', () => {
    expect(
      ['focus', 'consistency', 'time_based', 'social', 'event', 'rare'].map(categoryLabel),
    ).toEqual(['Focus', 'Consistency', 'Time of day', 'Social', 'Events', 'Rare']);
    expect(categoryLabel('seasonal')).toBe('Other');
  });

  it('groups owned badges in the spec’s category order, each in the order earned', () => {
    const odd = makeBadge({ id: 'x', name: 'Odd', category: 'seasonal' });
    const sections = badgeSections([STREAK_7, odd, FIRST_SESSION, HOURS_100]);
    expect(sections.map((s) => [s.title, s.badges.map((b) => b.id)])).toEqual([
      ['Focus', ['first-session', 'focus-hours:100']],
      ['Consistency', ['focus-streak:7']],
      ['Other', ['x']],
    ]);
  });
});
