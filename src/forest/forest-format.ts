import type { ForestItem, ForestPage, MonthRef } from '../api/forest';
import { spokenMinutes } from '../consistency/goal-format';
import { formatFocused } from '../history/history-format';
import { stageName } from '../tree/describe-tree';
import { toTreeVisualState } from '../tree/visual-state';

/**
 * Phrases the forest (M3.4). Display only: the months, their kinds, and their order are the
 * server's; nothing is filled in, reordered, or computed here.
 */

const MINUTE = 60_000;

/** "September 2026". */
export function monthTitle({ year, month }: MonthRef): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Sep": a landscape label. */
export function shortMonth({ year, month }: MonthRef): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'short',
    timeZone: 'UTC',
  });
}

export const monthKey = ({ year, month }: MonthRef) => `${year}-${month}`;

/** The stage's name, through the renderer's adapter (an unknown stage falls back there). */
export function itemStage(item: Extract<ForestItem, { tree: unknown }>): string {
  return stageName(toTreeVisualState(item.tree).stage);
}

/** "2 hours 35 minutes focused": the month's focus total (never its growth), spoken. */
function focusSummary(item: ForestItem): string {
  const minutes = Math.floor(item.focusedMilliseconds / MINUTE);
  if (minutes < 1) return item.kind === 'growing' ? 'no focus yet' : 'no focus recorded';
  return `${spokenMinutes(minutes)} focused${item.kind === 'growing' ? ' so far' : ''}`;
}

/**
 * What a month says to a screen reader, in both views: month, kind or stage, and its focus
 * total from the server. A quiet month is never a shortfall.
 */
export function forestItemLabel(item: ForestItem): string {
  const title = monthTitle(item);
  if (item.kind === 'resting') return `${title}, a quiet month, ${focusSummary(item)}`;
  if (item.kind === 'growing') {
    return `${title}, growing now, ${itemStage(item)}, ${focusSummary(item)}`;
  }
  return `${title}, ${itemStage(item)}, ${focusSummary(item)}`;
}

/**
 * The loaded pages as one timeline, in the server's order (newest first), each month once: a
 * month repeated on a later page (it moved while paging) keeps its first place.
 */
export function mergeForestPages(pages: readonly Pick<ForestPage, 'items'>[]): ForestItem[] {
  const seen = new Set<string>();
  const items: ForestItem[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      const key = monthKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  return items;
}

/** Consecutive months of the same year, in the given order: a year is one group across pages. */
export function groupByYear(items: readonly ForestItem[]): { year: number; items: ForestItem[] }[] {
  const groups: { year: number; items: ForestItem[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.year === item.year) last.items.push(item);
    else groups.push({ year: item.year, items: [item] });
  }
  return groups;
}

/** "75 h 30 min of focus · 3 trees planted": the forest's quiet header. */
export function forestSummaryText(summary: ForestPage['summary']): string {
  const trees = `${summary.treeCount} ${summary.treeCount === 1 ? 'tree' : 'trees'} planted`;
  return summary.lifetimeFocusedMinutes > 0
    ? `${formatFocused(summary.lifetimeFocusedMinutes * MINUTE)} of focus · ${trees}`
    : trees;
}

/** Whole minutes as "25 h 10 min". */
export function formatMinutes(minutes: number): string {
  return formatFocused(minutes * MINUTE);
}

/** The month after `month`: the new month a ceremony reveals. */
export function nextMonth({ year, month }: MonthRef): MonthRef {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** "November". */
export function monthName({ year, month }: MonthRef): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    timeZone: 'UTC',
  });
}
