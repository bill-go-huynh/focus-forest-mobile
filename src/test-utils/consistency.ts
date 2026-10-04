import type { Goals, RestDays, Streak } from '../api/consistency';
import { HOME_TODAY, makeHome } from './core-loop';

/**
 * Goals, rest days, and streak answers shaped like the A3.2 contracts (GET /me/goals,
 * /me/rest-days, /me/streak and their writes). Every value is server truth.
 */

export function makeGoals(overrides: Partial<Goals['daily']> = {}): Goals {
  const home = makeHome();
  return { ...home.goals, daily: { ...home.goals.daily, ...overrides } };
}

/** The configured default (30 min) a user who never chose a daily goal sees. */
export function defaultGoals(): Goals {
  return makeGoals({
    minutes: 30,
    isDefault: true,
    today: {
      date: HOME_TODAY,
      targetMinutes: 30,
      focusedMinutes: 0,
      remainingMinutes: 30,
      completed: false,
    },
  });
}

export function makeRestDays(dates: string[] = [], overrides: Partial<RestDays['allowance']> = {}) {
  const used = dates.filter((date) => date >= '2026-10-05' && date <= '2026-10-11').length;
  return {
    restDays: dates.map((date) => ({ date })),
    allowance: { perWeek: 2, weekStart: '2026-10-05', used, remaining: 2 - used, ...overrides },
  } satisfies RestDays;
}

export function makeStreak(overrides: Partial<Streak> = {}): Streak {
  return { ...makeHome().streak, ...overrides };
}

/** A streak with yesterday missed, kept if the user accepts the offered recovery. */
export function streakWithOffer(previousStreak = 12): Streak {
  return makeStreak({
    current: 1,
    longest: previousStreak,
    milestones: { reached: [], next: 3 },
    recovery: {
      offer: { missedDate: '2026-10-06', returnDate: HOME_TODAY, previousStreak },
      usedThisMonth: 0,
      perMonth: 1,
    },
  });
}
