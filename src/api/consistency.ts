import { z } from 'zod';

import type { ApiClient } from './client';
import { goalsSchema, streakSchema } from './core-loop';
import { HttpError } from './errors';

/**
 * Goals, rest days, and the streak (A3.2). The server decides every rule: when a goal change
 * applies, which days can rest, the weekly allowance, the streak, and whether a recovery is
 * offered. The client sends what the user chose and shows the answer.
 */

export { goalsSchema, streakSchema };
export type Goals = z.infer<typeof goalsSchema>;
export type { Streak } from './core-loop';
export type WeeklyGoal = NonNullable<Goals['weekly']['goal']>;
export type WeeklyGoalType = WeeklyGoal['type'];

const localDate = z.iso.date();
const count = z.number().int().nonnegative();

/** RestDaysResponse: planned days from this week's Monday on, and this week's allowance. */
export const restDaysSchema = z.object({
  restDays: z.array(z.object({ date: localDate })),
  allowance: z.object({ perWeek: count, weekStart: localDate, used: count, remaining: count }),
});
export type RestDays = z.infer<typeof restDaysSchema>;

export function getGoals(client: ApiClient): Promise<Goals> {
  return client.request('/me/goals', { schema: goalsSchema });
}

/** A first daily goal applies today; a later change applies tomorrow (the answer says). */
export function setDailyGoal(client: ApiClient, minutes: number): Promise<Goals> {
  return client.request('/me/goals/daily', {
    method: 'PUT',
    body: { minutes },
    schema: goalsSchema,
  });
}

/** With no goal this week it applies now; a change to a goal in effect applies from Monday. */
export function setWeeklyGoal(client: ApiClient, goal: WeeklyGoal): Promise<Goals> {
  return client.request('/me/goals/weekly', {
    method: 'PUT',
    body: { type: goal.type, target: goal.target },
    schema: goalsSchema,
  });
}

/** Ends the weekly goal from next Monday. Idempotent. */
export function clearWeeklyGoal(client: ApiClient): Promise<Goals> {
  return client.request('/me/goals/weekly', { method: 'DELETE', schema: goalsSchema });
}

export function getRestDays(client: ApiClient): Promise<RestDays> {
  return client.request('/me/rest-days', { schema: restDaysSchema });
}

function restDayPath(date: string): string {
  if (!localDate.safeParse(date).success) throw new Error('A rest day is a calendar date.');
  return `/me/rest-days/${date}`;
}

/** Idempotent: planning a day already planned answers the same list. */
export async function scheduleRestDay(client: ApiClient, date: string): Promise<RestDays> {
  return client.request(restDayPath(date), { method: 'PUT', schema: restDaysSchema });
}

export async function cancelRestDay(client: ApiClient, date: string): Promise<RestDays> {
  return client.request(restDayPath(date), { method: 'DELETE', schema: restDaysSchema });
}

export function getStreak(client: ApiClient): Promise<z.infer<typeof streakSchema>> {
  return client.request('/me/streak', { schema: streakSchema });
}

/** Accepts the offered recovery of `missedDate`. Idempotent: a repeat answers the same streak. */
export function acceptRecovery(
  client: ApiClient,
  missedDate: string,
): Promise<z.infer<typeof streakSchema>> {
  return client.request('/me/streak/recoveries', {
    method: 'POST',
    body: { missedDate },
    schema: streakSchema,
  });
}

/**
 * The server's reason for refusing a goal, rest-day, or recovery write, by its stable `code`
 * (`rest_day_in_past`, `rest_allowance_used`, `return_window_passed`, …). A 400 without a code
 * is a value the API does not take (`invalid_value`). Null for anything else (offline, 5xx).
 * Screens phrase these calmly; the code itself is never shown.
 */
export function consistencyErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpError) || error.status >= 500) return null;
  if (error.code) return error.code;
  return error.status === 400 ? 'invalid_value' : null;
}
