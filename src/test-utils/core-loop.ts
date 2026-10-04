import type { CurrentTreeResponse, GrowthResult, HomeResponse } from '../api/core-loop';
import { makeTopic } from './topics';
import { treeDto, type TreeFixtureOptions } from './trees';

/**
 * Phase 3 API answers shaped like the A3.2–A3.5 contracts (GET /me/home, GET
 * /me/trees/current, the `growth` of PUT /me/sessions/:id). Every value is server truth.
 */

export const HOME_TODAY = '2026-10-07';

export function makeHome(
  overrides: Partial<HomeResponse> = {},
  tree: TreeFixtureOptions = {},
): HomeResponse {
  return {
    today: HOME_TODAY,
    tree: treeDto(tree),
    goals: {
      daily: {
        minutes: 60,
        isDefault: false,
        pending: null,
        today: {
          date: HOME_TODAY,
          targetMinutes: 60,
          focusedMinutes: 42,
          remainingMinutes: 18,
          completed: false,
        },
      },
      weekly: { goal: null, pending: null, thisWeek: null },
    },
    streak: {
      current: 4,
      longest: 9,
      today: 'active',
      milestones: { reached: [3], next: 7 },
      recovery: { offer: null, usedThisMonth: 0, perMonth: 1 },
    },
    rest: {
      today: false,
      allowance: { perWeek: 2, weekStart: '2026-10-05', used: 0, remaining: 2 },
    },
    recentTopics: [],
    pendingCeremony: null,
    week: {
      weekStart: '2026-10-05',
      focusedMilliseconds: 200 * 60_000,
      sessionCount: 6,
      activeDays: 3,
    },
    ...overrides,
  };
}

/** A weekly goal of focused minutes with this week's progress. */
export function withWeeklyGoal(home: HomeResponse, current = 200, target = 300): HomeResponse {
  return {
    ...home,
    goals: {
      ...home.goals,
      weekly: {
        goal: { type: 'focused_minutes', target },
        pending: null,
        thisWeek: {
          weekStart: home.week.weekStart,
          type: 'focused_minutes',
          target,
          current,
          completed: current >= target,
        },
      },
    },
  };
}

export function makeCurrentTree(
  overrides: Partial<CurrentTreeResponse['stats']> = {},
  tree: TreeFixtureOptions = {},
): CurrentTreeResponse {
  return {
    tree: treeDto(tree),
    stats: {
      focusedMinutes: 750,
      sessionCount: 21,
      activeDays: 12,
      dailyGoalsMet: 8,
      weeklyGoalsMet: 1,
      topTopicId: makeTopic().id,
      ...overrides,
    },
  };
}

/** What a counted session did to its month's tree. */
export function makeGrowth(
  overrides: Partial<GrowthResult> = {},
  tree: TreeFixtureOptions = {},
): GrowthResult {
  return {
    counted: true,
    monthClosed: false,
    newTraits: [],
    tree: treeDto(tree),
    ...overrides,
  };
}

/** A late session of a month already archived: kept in history, no tree change. */
export const CLOSED_MONTH_GROWTH: GrowthResult = {
  counted: true,
  monthClosed: true,
  newTraits: [],
  tree: null,
};
