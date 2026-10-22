import { z } from 'zod';

import type { ApiClient } from './client';

/**
 * Leaderboards (A5.8, focus-forest-api `src/leaderboards/`): fair scores the server derives from
 * days kept, daily goals, active days, and focus time capped per day, never raw hours alone.
 * Only people who opted in appear; anyone can read a board.
 */

const count = z.number().int().nonnegative();

const boardPersonSchema = z.object({
  id: z.string(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const leaderboardRowSchema = z.object({
  /** Ties share a rank. */
  rank: z.number().int().positive(),
  person: boardPersonSchema,
  score: count,
  you: z.boolean(),
});
export type LeaderboardRow = z.infer<typeof leaderboardRowSchema>;

export const leaderboardSchema = z.object({
  scope: z.string(),
  period: z.object({ kind: z.string(), startDate: z.iso.date(), endDate: z.iso.date() }),
  optedIn: z.boolean(),
  rows: z.array(leaderboardRowSchema),
  you: leaderboardRowSchema.nullable(),
});
export type Leaderboard = z.infer<typeof leaderboardSchema>;

export type LeaderboardScope = 'friends' | 'global';
export type LeaderboardPeriod = 'weekly' | 'monthly';

export function getLeaderboard(
  client: ApiClient,
  query: { scope: LeaderboardScope; period: LeaderboardPeriod },
) {
  return client.request(`/leaderboards?scope=${query.scope}&period=${query.period}`, {
    schema: leaderboardSchema,
  });
}
