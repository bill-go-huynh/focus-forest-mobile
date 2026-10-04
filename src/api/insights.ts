import { z } from 'zod';

import type { ApiClient } from './client';
import { weeklyProgressSchema } from './core-loop';
import { archivedStatsSchema } from './forest';
import { TOPIC_COLORS } from './topics';

/**
 * Insights contracts (A3.5): a week, a month, the heatmap, personal records, and lifetime stats.
 * Durations are integer milliseconds (minutes only where a field says so); shares are ratios
 * from 0 to 1. Everything is the server's: the client formats, never recomputes.
 */

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const instant = z.iso.datetime();
const localDate = z.iso.date();
const count = z.number().int().nonnegative();

export const DAILY_GOAL_STATES = ['met', 'not_met', 'pending', 'none'] as const;

/** One local date: focus, rest, and the daily goal, all at once (a rest day can have focus). */
export const dayCellSchema = z
  .object({
    date: localDate,
    focusedMilliseconds: count,
    sessionCount: count,
    active: z.boolean(),
    rest: z.boolean(),
    dailyGoal: z.enum(DAILY_GOAL_STATES),
    dailyGoalMinutes: count.nullable(),
  })
  .refine((cell) => cell.active === cell.sessionCount > 0, {
    message: 'A day is active exactly when it has a counted session.',
  });
export type DayCell = z.infer<typeof dayCellSchema>;

/** Completed out of decided days or weeks. */
export const goalRateSchema = z
  .object({ completed: count, eligible: count })
  .refine((rate) => rate.completed <= rate.eligible, {
    message: 'A rate never completes more than its denominator.',
  });
export type GoalRate = z.infer<typeof goalRateSchema>;

const focusSummarySchema = z.object({
  focusedMilliseconds: count,
  sessionCount: count,
  activeDays: count,
  averageFocusedMillisecondsPerActiveDay: count.nullable(),
});

/** A topic's focus in the period; archived topics keep their history. */
export const topicInsightSchema = z.object({
  topicId: uuid,
  name: z.string().min(1),
  icon: z.string().min(1),
  color: z.enum(TOPIC_COLORS),
  status: z.enum(['active', 'archived']),
  focusedMilliseconds: count,
  sessionCount: count,
  /** Of the period's counted focus: a ratio from 0 to 1. */
  share: z.number().min(0).max(1),
  lastUsedAt: instant,
});
export type TopicInsight = z.infer<typeof topicInsightSchema>;

const longestSessionSchema = z.object({
  sessionId: uuid,
  topicId: uuid,
  localDate,
  focusedMilliseconds: count,
});

const periodStreakSchema = z.object({ current: count, longest: count, longestInPeriod: count });

/** A best (never a worst). The kind is kept when this version does not know it. */
export const personalRecordSchema = z.object({
  kind: z.string().min(1),
  value: count,
  unit: z.enum(['minutes', 'days']),
  achievedOn: localDate,
});
export type PersonalRecord = z.infer<typeof personalRecordSchema>;

export const weekInsightsSchema = z.object({
  period: z.object({
    kind: z.literal('week'),
    from: localDate,
    to: localDate,
    current: z.boolean(),
  }),
  summary: focusSummarySchema,
  days: z.array(dayCellSchema).length(7),
  topics: z.array(topicInsightSchema),
  longestSession: longestSessionSchema.nullable(),
  goals: z.object({
    daily: goalRateSchema,
    /** This week's weekly goal and its progress; null when the week had none. */
    weekly: weeklyProgressSchema.nullable(),
  }),
  restDays: count,
  streak: periodStreakSchema,
  newRecords: z.array(personalRecordSchema),
});
export type WeekInsights = z.infer<typeof weekInsightsSchema>;

export const monthInsightsSchema = z.object({
  period: z.object({
    kind: z.literal('month'),
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    from: localDate,
    to: localDate,
    current: z.boolean(),
    archived: z.boolean(),
  }),
  summary: focusSummarySchema,
  topics: z.array(topicInsightSchema),
  topTopic: topicInsightSchema.nullable(),
  longestSession: longestSessionSchema.nullable(),
  mostProductiveDay: z.object({ date: localDate, focusedMinutes: count }).nullable(),
  mostProductiveWeek: z.object({ weekStart: localDate, focusedMinutes: count }).nullable(),
  days: z.array(dayCellSchema),
  /**
   * Completion rates: daily over the month's decided days; weekly over the weeks whose Monday is
   * in the month. Not the archived tree's weekly goal count (`archivedStats.weeklyGoalsMet`).
   */
  goals: z.object({ daily: goalRateSchema, weekly: goalRateSchema }),
  restDays: count,
  streak: periodStreakSchema,
  newRecords: z.array(personalRecordSchema),
  /** The archive's frozen snapshot (late sessions never change it); null until archived. */
  archivedStats: archivedStatsSchema.nullable(),
});
export type MonthInsights = z.infer<typeof monthInsightsSchema>;

export const heatmapSchema = z.object({
  from: localDate,
  to: localDate,
  days: z.array(dayCellSchema),
});
export type Heatmap = z.infer<typeof heatmapSchema>;

export const recordsSchema = z.object({ records: z.array(personalRecordSchema) });

export const lifetimeStatsSchema = z.object({
  focusedMilliseconds: count,
  sessionCount: count,
  currentStreak: count,
  longestStreak: count,
  archivedTreeCount: count,
});
export type LifetimeStats = z.infer<typeof lifetimeStatsSchema>;

/** A Monday-to-Sunday week by its Monday (the server's `period.from`); null: the current one. */
export function getWeekInsights(
  client: ApiClient,
  weekStart: string | null,
): Promise<WeekInsights> {
  const query = weekStart === null ? '' : `?weekStart=${weekStart}`;
  return client.request(`/me/insights/week${query}`, { schema: weekInsightsSchema });
}

/** A calendar month; null: the current one. */
export function getMonthInsights(
  client: ApiClient,
  month: { year: number; month: number } | null,
): Promise<MonthInsights> {
  const query = month === null ? '' : `?year=${month.year}&month=${month.month}`;
  return client.request(`/me/insights/month${query}`, { schema: monthInsightsSchema });
}

/** The last 365 days (the server's default range). */
export function getHeatmap(client: ApiClient): Promise<Heatmap> {
  return client.request('/me/insights/heatmap', { schema: heatmapSchema });
}

export async function getRecords(client: ApiClient): Promise<PersonalRecord[]> {
  return (await client.request('/me/insights/records', { schema: recordsSchema })).records;
}

/** Lifetime stats; the join date is the profile's, not repeated here. */
export function getLifetimeStats(client: ApiClient): Promise<LifetimeStats> {
  return client.request('/me/profile/stats', { schema: lifetimeStatsSchema });
}
