import type { DayCell, GoalRate, PersonalRecord, TopicInsight, WeeklyProgress } from '../api';
import { formatFocused } from '../history/history-format';

/**
 * Phrases Insights (M3.5): reflection, not a dashboard. Display only: every number is the
 * server's (durations in milliseconds, shares as 0–1 ratios, rates as completed/eligible), and
 * dates are the server's local dates, formatted as calendar days (UTC).
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const utc = (date: string) => new Date(`${date}T00:00:00.000Z`);

/** "Monday, October 5". */
export function longDate(date: string): string {
  return utc(date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "October 2026". */
export function monthTitle(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** A calendar date `days` after `date`: moving between weeks from the server's Monday. */
export function addDays(date: string, days: number): string {
  return new Date(utc(date).getTime() + days * DAY).toISOString().slice(0, 10);
}

export function previousMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** "This week", or "Week of Monday, September 28", from the server's period. */
export function weekTitle(period: { from: string; current: boolean }): string {
  return period.current ? 'This week' : `Week of ${longDate(period.from)}`;
}

/** The one narrative line that leads a period. A quiet period is said plainly, never as a lack. */
export function narrative(
  title: string,
  summary: { focusedMilliseconds: number; sessionCount: number; activeDays: number },
  current: boolean,
): string {
  if (summary.sessionCount === 0) return `${title} · ${current ? 'no focus yet' : 'a quiet time'}.`;
  return `${title} · ${formatFocused(summary.focusedMilliseconds)} across ${plural(
    summary.sessionCount,
    'session',
  )}, on ${plural(summary.activeDays, 'active day')}.`;
}

const GOAL_WORDS: Record<DayCell['dailyGoal'], string | null> = {
  met: 'daily goal met',
  not_met: 'daily goal not reached',
  pending: 'daily goal in progress',
  none: null,
};

/** "Tuesday, October 6: 1 h 20 min, 3 sessions, rest day, daily goal met". */
export function dayLabel(cell: DayCell): string {
  const parts = [
    cell.sessionCount > 0
      ? `${formatFocused(cell.focusedMilliseconds)}, ${plural(cell.sessionCount, 'session')}`
      : 'no focus',
  ];
  if (cell.rest) parts.push('rest day');
  const goal = GOAL_WORDS[cell.dailyGoal];
  if (goal) parts.push(goal);
  return `${longDate(cell.date)}: ${parts.join(', ')}`;
}

/** Focus intensity for the visual only: 0 (none) to 3, from the server's duration. */
export function intensity(cell: DayCell): 0 | 1 | 2 | 3 {
  const minutes = cell.focusedMilliseconds / MINUTE;
  if (minutes <= 0) return 0;
  if (minutes < 45) return 1;
  if (minutes < 120) return 2;
  return 3;
}

export function dailyRateText(rate: GoalRate): string | null {
  return rate.eligible === 0
    ? null
    : `Daily goal met on ${rate.completed} of ${plural(rate.eligible, 'day')}`;
}

/** The month's weekly goal rate (weeks owned by their Monday), never the archive's count. */
export function weeklyRateText(rate: GoalRate): string | null {
  return rate.eligible === 0
    ? null
    : `Weekly goal met in ${rate.completed} of ${plural(rate.eligible, 'week')}`;
}

/** This week's weekly goal progress, in the goal's own unit. */
export function weeklyProgressText(progress: WeeklyProgress): string {
  const unit = progress.type === 'session_count' ? 'sessions' : 'min';
  return progress.completed
    ? `Weekly goal reached: ${progress.current} / ${progress.target} ${unit}`
    : `Weekly goal: ${progress.current} of ${progress.target} ${unit}`;
}

/** "63%": the server's ratio as a whole percentage. */
export function sharePercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function topicLine(topic: TopicInsight): string {
  const parts = [
    formatFocused(topic.focusedMilliseconds),
    plural(topic.sessionCount, 'session'),
    sharePercent(topic.share),
  ];
  if (topic.status === 'archived') parts.push('archived topic');
  return parts.join(' · ');
}

const RECORD_NAMES: Record<string, string> = {
  most_focused_day: 'Most focused day',
  most_focused_week: 'Most focused week',
  most_focused_month: 'Most focused month',
  longest_streak: 'Longest streak',
  longest_session: 'Longest session',
  longest_daily_goal_streak: 'Longest daily goal streak',
};

/** "Longest session: 1 h 35 min": the record and its value. */
export function recordValue(record: PersonalRecord): string {
  const value =
    record.unit === 'minutes' ? formatFocused(record.value * MINUTE) : plural(record.value, 'day');
  return `${RECORD_NAMES[record.kind] ?? 'Personal best'}: ${value}`;
}

/** When it was achieved, read as the record's own period. */
export function recordWhen(record: PersonalRecord): string {
  const date = utc(record.achievedOn);
  switch (record.kind) {
    case 'most_focused_week':
      return `week of ${longDate(record.achievedOn)}`;
    case 'most_focused_month':
      return monthTitle(date.getUTCFullYear(), date.getUTCMonth() + 1);
    case 'longest_streak':
    case 'longest_daily_goal_streak':
      return `reached ${longDate(record.achievedOn)}`;
    default:
      return longDate(record.achievedOn);
  }
}

/** The days of `cells` grouped by calendar month, newest last (the heatmap's word view). */
export function monthsOf(cells: readonly DayCell[]) {
  const months = new Map<string, { year: number; month: number; cells: DayCell[] }>();
  for (const cell of cells) {
    const date = utc(cell.date);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const key = `${year}-${month}`;
    const entry = months.get(key) ?? { year, month, cells: [] };
    entry.cells.push(cell);
    months.set(key, entry);
  }
  return [...months.values()];
}

/** Totals of cells the server sent (a summary of its own days, not a new statistic). */
export function cellTotals(cells: readonly DayCell[]) {
  return {
    focusedMilliseconds: cells.reduce((sum, cell) => sum + cell.focusedMilliseconds, 0),
    activeDays: cells.filter((cell) => cell.active).length,
    restDays: cells.filter((cell) => cell.rest).length,
    goalMet: cells.filter((cell) => cell.dailyGoal === 'met').length,
  };
}

export { formatFocused, plural };
