import type { Recap } from '../api';
import { stageName } from '../tree/describe-tree';
import { toTreeVisualState } from '../tree/visual-state';
import { formatMinutes, monthTitle } from './forest-format';

/**
 * The recap's pages (docs/05 → Monthly recap, docs/02 → Recap), from the stored snapshot only:
 * one idea per page, highlights first, a page only when the month has it (never a shortfall),
 * then the share page. Nothing is recomputed: every value is the recap's.
 */
export type RecapPage =
  | { kind: 'cover' }
  | { kind: 'focus'; value: string }
  | { kind: 'sessions'; value: string }
  | { kind: 'topTopic'; value: string }
  | { kind: 'streak'; value: string }
  | { kind: 'bestDay'; value: string }
  | { kind: 'bestWeek'; value: string }
  | { kind: 'records'; lines: string[] }
  | { kind: 'notes'; notes: { sessionId: string; note: string }[] }
  | { kind: 'share' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function longDate(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const RECORD_NAMES: Record<string, string> = {
  most_focused_day: 'Most focused day',
  most_focused_week: 'Most focused week',
  most_focused_month: 'Most focused month',
  longest_streak: 'Longest streak',
  longest_session: 'Longest session',
  longest_daily_goal_streak: 'Longest daily goal streak',
};

/** "Most focused day: 3 h 5 min"; a record kind this version does not know is still a best. */
export function recordLine(record: Recap['newRecords'][number]): string {
  const value =
    record.unit === 'minutes' ? formatMinutes(record.value) : plural(record.value, 'day');
  return `${RECORD_NAMES[record.kind] ?? 'New personal best'}: ${value}`;
}

export function recapPages(recap: Recap): RecapPage[] {
  const { stats } = recap;
  const pages: RecapPage[] = [{ kind: 'cover' }];
  pages.push({ kind: 'focus', value: formatMinutes(stats.focusedMinutes) });
  pages.push({
    kind: 'sessions',
    value: `${plural(stats.sessionCount, 'session')} over ${plural(stats.activeDays, 'active day')}`,
  });
  if (stats.topTopic) pages.push({ kind: 'topTopic', value: stats.topTopic.name });
  if (stats.longestStreak > 0)
    pages.push({ kind: 'streak', value: plural(stats.longestStreak, 'day') });
  if (recap.mostProductiveDay) {
    const { date, focusedMinutes } = recap.mostProductiveDay;
    pages.push({ kind: 'bestDay', value: `${longDate(date)} · ${formatMinutes(focusedMinutes)}` });
  }
  if (recap.mostProductiveWeek) {
    const { weekStart, focusedMinutes } = recap.mostProductiveWeek;
    pages.push({
      kind: 'bestWeek',
      value: `Week of ${longDate(weekStart)} · ${formatMinutes(focusedMinutes)}`,
    });
  }
  if (recap.newRecords.length > 0) {
    pages.push({ kind: 'records', lines: recap.newRecords.map(recordLine) });
  }
  if (recap.highlightedNotes.length > 0) {
    pages.push({ kind: 'notes', notes: recap.highlightedNotes });
  }
  pages.push({ kind: 'share' });
  return pages;
}

export interface RecapShareContent {
  title: string;
  lines: string[];
}

/**
 * What a shared recap card says: the month, its tree, and a few highlights. Never a note (notes
 * are private and need an explicit opt-in, which is not built yet), never a topic, an id, or
 * anything about the account.
 */
export function recapShareContent(recap: Recap): RecapShareContent {
  const { stats } = recap;
  const lines = [
    `${stageName(toTreeVisualState(recap.tree).stage)}`,
    `${formatMinutes(stats.focusedMinutes)} of focus`,
    plural(stats.activeDays, 'active day'),
  ];
  if (stats.longestStreak > 0) lines.push(`Longest streak: ${plural(stats.longestStreak, 'day')}`);
  return { title: monthTitle(recap), lines };
}
