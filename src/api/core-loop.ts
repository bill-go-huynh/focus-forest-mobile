import { z } from 'zod';

import type { ApiClient } from './client';
import { topicSchema } from './topics';

/**
 * Phase 3 Core Loop contracts (A3.1–A3.5): the monthly tree, what a session did to it, Home, and
 * the current tree. Structure is checked strictly; values a newer server may add are kept as
 * data (an unknown stage, vitality, or trait id), and the renderer's adapter degrades on them.
 * Nothing here computes product truth: the client shows what the server says.
 */

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const instant = z.iso.datetime();
const localDate = z.iso.date();
const count = z.number().int().nonnegative();

const levelSchema = z.object({ level: count, maxLevel: count });

/** The tree's earned progress (A3.1). `stage` is any string: a newer stage is kept, not refused. */
export const treeProgressSchema = z.object({
  stage: z.string().min(1),
  stageNumber: z.number().int(),
  progressToNextStage: z.number().min(0).max(1).nullable(),
  growthMinutes: count,
  fullness: levelSchema,
  blossoms: levelSchema,
  richness: z.object({ tier: count, maxTier: count }),
});

export const treeTraitSchema = z.object({ id: z.string().min(1), earnedAt: instant });

/** A monthly tree (TreeStateDto). Vitality is null exactly for an archived tree. */
export const treeStateSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  status: z.enum(['growing', 'archived']),
  species: z.string().min(1),
  variationSeed: count,
  partialFirstMonth: z.boolean(),
  configVersion: count,
  progress: treeProgressSchema,
  traits: z.array(treeTraitSchema),
  vitality: z.string().min(1).nullable(),
});
export type TreeStateResponse = z.infer<typeof treeStateSchema>;

const changeOf = <T extends z.ZodType>(value: T) => z.object({ from: value, to: value });

/**
 * What one submitted session did to its month's tree (GrowthResultDto), stored with the session
 * and returned unchanged on replays. A session that does not count changes nothing; a session of
 * a month already archived (`monthClosed`) changes nothing and shows no tree.
 */
export const growthResultSchema = z
  .object({
    counted: z.boolean(),
    monthClosed: z.boolean(),
    stage: changeOf(z.string().min(1)).optional(),
    fullness: changeOf(count).optional(),
    blossoms: changeOf(count).optional(),
    richness: changeOf(count).optional(),
    newTraits: z.array(treeTraitSchema),
    tree: treeStateSchema.nullable(),
  })
  .refine((growth) => growth.counted || !changed(growth), {
    message: 'A session that does not count changes nothing.',
  })
  .refine((growth) => !growth.monthClosed || (!changed(growth) && growth.tree === null), {
    message: 'A session of a closed month changes and shows no tree.',
  });
export type GrowthResult = z.infer<typeof growthResultSchema>;

function changed(growth: {
  stage?: unknown;
  fullness?: unknown;
  blossoms?: unknown;
  richness?: unknown;
  newTraits: unknown[];
}): boolean {
  return (
    growth.stage !== undefined ||
    growth.fullness !== undefined ||
    growth.blossoms !== undefined ||
    growth.richness !== undefined ||
    growth.newTraits.length > 0
  );
}

const weeklyGoalSchema = z.object({
  type: z.enum(['focused_minutes', 'session_count']),
  target: z.number().int().positive(),
});

export const dailyProgressSchema = z.object({
  date: localDate,
  targetMinutes: count,
  focusedMinutes: count,
  remainingMinutes: count,
  completed: z.boolean(),
});
export type DailyProgress = z.infer<typeof dailyProgressSchema>;

export const weeklyProgressSchema = z.object({
  weekStart: localDate,
  type: weeklyGoalSchema.shape.type,
  target: z.number().int().positive(),
  current: count,
  completed: z.boolean(),
});
export type WeeklyProgress = z.infer<typeof weeklyProgressSchema>;

/** GoalsResponse (A3.2). */
export const goalsSchema = z.object({
  daily: z.object({
    minutes: count,
    isDefault: z.boolean(),
    pending: z.object({ minutes: count, effectiveFrom: localDate }).nullable(),
    today: dailyProgressSchema,
  }),
  weekly: z.object({
    goal: weeklyGoalSchema.nullable(),
    pending: z.object({ goal: weeklyGoalSchema.nullable(), effectiveFrom: localDate }).nullable(),
    thisWeek: weeklyProgressSchema.nullable(),
  }),
});

/** StreakResponse (A3.2). The recovery offer is read here and acted on in M3.3. */
export const streakSchema = z.object({
  current: count,
  longest: count,
  today: z.enum(['active', 'rest', 'pending']),
  milestones: z.object({ reached: z.array(count), next: count.nullable() }),
  recovery: z.object({
    offer: z
      .object({ missedDate: localDate, returnDate: localDate, previousStreak: count })
      .nullable(),
    usedThisMonth: count,
    perMonth: count,
  }),
});
export type Streak = z.infer<typeof streakSchema>;

/** The month whose month-end ceremony is still to be seen (A3.4); shown in M3.4, not here. */
export const pendingCeremonySchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

/** GET /me/home (HomeResponse): everything Home shows, in one request. */
export const homeSchema = z.object({
  today: localDate,
  tree: treeStateSchema,
  goals: goalsSchema,
  streak: streakSchema,
  rest: z.object({
    today: z.boolean(),
    allowance: z.object({
      perWeek: count,
      weekStart: localDate,
      used: count,
      remaining: count,
    }),
  }),
  recentTopics: z.array(topicSchema),
  pendingCeremony: pendingCeremonySchema.nullable(),
  week: z.object({
    weekStart: localDate,
    focusedMilliseconds: count,
    sessionCount: count,
    activeDays: count,
  }),
});
export type HomeResponse = z.infer<typeof homeSchema>;

/** GET /me/trees/current (CurrentTreeResponse): the tree and this month's stats so far. */
export const currentTreeSchema = z.object({
  tree: treeStateSchema,
  stats: z.object({
    focusedMinutes: count,
    sessionCount: count,
    activeDays: count,
    dailyGoalsMet: count,
    weeklyGoalsMet: count,
    topTopicId: uuid.nullable(),
  }),
});
export type CurrentTreeResponse = z.infer<typeof currentTreeSchema>;

export function getHome(client: ApiClient): Promise<HomeResponse> {
  return client.request('/me/home', { schema: homeSchema });
}

export function getCurrentTree(client: ApiClient): Promise<CurrentTreeResponse> {
  return client.request('/me/trees/current', { schema: currentTreeSchema });
}
