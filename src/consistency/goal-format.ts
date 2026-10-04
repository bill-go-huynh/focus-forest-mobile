import { consistencyErrorCode, NetworkError, type Goals, type WeeklyGoal } from '../api';
import { formatFocused } from '../history/history-format';

/**
 * Phrases the server's goals, rest days, and streak (M3.3). Display only: every value and every
 * decision (when a change applies, the allowance, the streak, the recovery offer) is the
 * server's. Dates are the server's local dates, formatted as calendar days (UTC), never
 * recomputed from the device clock.
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** What the API takes for a daily goal (a technical bound, not Product configuration). */
export const DAILY_GOAL_MAX_MINUTES = 1440;

/** Daily goal choices, in minutes; Custom covers the rest. */
export const DAILY_GOAL_PRESETS = [15, 30, 45, 60, 90, 120] as const;

/** Weekly goal choices: hours of focus, or a number of sessions. */
export const WEEKLY_HOUR_PRESETS = [3, 5, 8, 10] as const;
export const WEEKLY_SESSION_PRESETS = [3, 5, 10, 15] as const;
/** What the API takes for each weekly type (technical bounds). */
export const WEEKLY_MAX = { hours: 168, sessions: 500 } as const;

/** "45 min", "1 h 30 min". */
export function formatGoalMinutes(minutes: number): string {
  return formatFocused(minutes * MINUTE);
}

/** "45 minutes", "1 hour 30 minutes": the spoken form of a preset. */
export function spokenMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (hours === 0) return part(rest, 'minute');
  return rest === 0 ? part(hours, 'hour') : `${part(hours, 'hour')} ${part(rest, 'minute')}`;
}

/** "5 h a week", "2 h 30 min a week", "5 sessions a week". */
export function weeklyGoalText(goal: WeeklyGoal): string {
  return goal.type === 'session_count'
    ? `${goal.target} session${goal.target === 1 ? '' : 's'} a week`
    : `${formatGoalMinutes(goal.target)} a week`;
}

function utc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** A calendar date `days` after `date` (for laying out the planner and naming "tomorrow"). */
export function addDays(date: string, days: number): string {
  return new Date(utc(date).getTime() + days * DAY).toISOString().slice(0, 10);
}

/** "Monday, October 12". */
export function longDate(date: string): string {
  return utc(date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Mon 12": a planner cell's visible label. */
export function shortDate(date: string): string {
  const weekday = utc(date).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
  return `${weekday} ${utc(date).getUTCDate()}`;
}

/** "tomorrow" when the date is the day after `today`, else "on Monday, October 12". */
export function whenFrom(date: string, today: string): string {
  return date === addDays(today, 1) ? 'tomorrow' : `on ${longDate(date)}`;
}

/** The pending daily change, beside the goal in effect: "Changes to 45 min tomorrow." */
export function pendingDailyText(goals: Goals): string | null {
  const { pending, today } = goals.daily;
  if (!pending) return null;
  return `Changes to ${formatGoalMinutes(pending.minutes)} ${whenFrom(pending.effectiveFrom, today.date)}.`;
}

/** What a daily save did, from the server's answer before and after. */
export function dailySavedText(before: Goals | undefined, after: Goals): string {
  const { pending, minutes, today } = after.daily;
  if (pending) {
    return `Saved. Your goal changes to ${formatGoalMinutes(pending.minutes)} ${whenFrom(pending.effectiveFrom, today.date)}.`;
  }
  if (!before || before.daily.isDefault || before.daily.minutes !== minutes) {
    return `Saved. Your daily goal is ${formatGoalMinutes(minutes)}, starting today.`;
  }
  return `Saved. Your daily goal stays ${formatGoalMinutes(minutes)}.`;
}

/** The pending weekly change: a new goal from a Monday, or the goal ending then. */
export function pendingWeeklyText(goals: Goals): string | null {
  const { pending } = goals.weekly;
  if (!pending) return null;
  return pending.goal
    ? `From ${longDate(pending.effectiveFrom)}: ${weeklyGoalText(pending.goal)}.`
    : `Your weekly goal ends on ${longDate(pending.effectiveFrom)}.`;
}

/** What a weekly save or end did, from the server's answer. */
export function weeklySavedText(after: Goals): string {
  const { pending, goal } = after.weekly;
  if (pending && pending.goal === null) {
    return `Saved. Your weekly goal ends on ${longDate(pending.effectiveFrom)}.`;
  }
  if (pending) return `Saved. Your new weekly goal starts ${longDate(pending.effectiveFrom)}.`;
  return goal ? 'Saved. Your weekly goal starts this week.' : 'Saved.';
}

/** "1 of 2 rest days left this week", or the allowance fully planned, said plainly. */
export function allowanceText(allowance: { perWeek: number; remaining: number }): string {
  if (allowance.perWeek === 0) return 'No rest days are available this week.';
  if (allowance.remaining === 0) return "This week's rest days are all planned.";
  const unit = allowance.perWeek === 1 ? 'rest day' : 'rest days';
  return `${allowance.remaining} of ${allowance.perWeek} ${unit} left this week`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function streakDaysText(label: string, days: number): string {
  return `${label}: ${plural(days, 'day')}`;
}

/** Today, as the server sees it for the streak. */
export function streakTodayText(today: 'active' | 'rest' | 'pending', current: number): string {
  if (today === 'active') return 'Today counts toward your streak.';
  if (today === 'rest') return 'Rest day today. Your streak is kept.';
  return current > 0
    ? 'One focus session today keeps your streak going.'
    : 'One focus session starts a streak.';
}

/** "3, 7, and 14 days". */
export function listDays(days: number[]): string {
  if (days.length <= 1) return `${days.join('')} day${days[0] === 1 ? '' : 's'}`;
  if (days.length === 2) return `${days[0]} and ${days[1]} days`;
  return `${days.slice(0, -1).join(', ')}, and ${days.at(-1)} days`;
}

const OFFLINE = "You're offline, so nothing was changed. Connect and try again.";
const GENERAL = "That couldn't be saved right now. Try again.";

/** A goal write the server or the network refused, in calm words; never its code or text. */
export function goalErrorText(error: unknown): string {
  if (error instanceof NetworkError) return OFFLINE;
  if (consistencyErrorCode(error) === 'invalid_value') {
    return `That goal can't be saved. Choose from 1 to ${DAILY_GOAL_MAX_MINUTES} minutes.`;
  }
  return GENERAL;
}

export function weeklyGoalErrorText(error: unknown): string {
  if (error instanceof NetworkError) return OFFLINE;
  if (consistencyErrorCode(error) === 'invalid_value') {
    return "That weekly goal can't be saved. Try a smaller number.";
  }
  return GENERAL;
}

const REST_REFUSALS: Record<string, string> = {
  rest_day_in_past: "That day has passed, so it can't be a rest day.",
  rest_day_today_not_allowed: "Today can't become a rest day anymore.",
  rest_day_too_far_ahead: 'Rest days can be planned up to a year ahead.',
  rest_allowance_used:
    "This week's rest days are already planned. Remove one to choose another day.",
  rest_day_not_found: 'That rest day was already removed.',
};

export function restErrorText(error: unknown): string {
  if (error instanceof NetworkError) return OFFLINE;
  return REST_REFUSALS[consistencyErrorCode(error) ?? ''] ?? GENERAL;
}

export function recoveryErrorText(error: unknown): string {
  if (error instanceof NetworkError) {
    return "You're offline, so your streak wasn't changed. Connect and try again.";
  }
  // Any refusal with a reason means the offer is gone (expired, already used, …).
  return consistencyErrorCode(error) ? 'Recovery is no longer available.' : GENERAL;
}
