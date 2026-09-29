import type { SessionHistoryItem } from '../api/history';

const MINUTE = 60_000;

export interface HistoryDay {
  /** The persisted day (A2.3), never recomputed on the device. */
  localDate: string;
  items: SessionHistoryItem[];
}

/**
 * Groups the server's list by each session's persisted `localDate`. Days appear in the order
 * their first session does and rows keep the server's order (startedAt DESC, id DESC): nothing
 * is sorted here, and no day is derived from `startedAt` in the device's time zone.
 */
export function groupByLocalDate(items: readonly SessionHistoryItem[]): HistoryDay[] {
  const days = new Map<string, SessionHistoryItem[]>();
  for (const item of items) {
    const day = days.get(item.localDate);
    if (day) day.push(item);
    else days.set(item.localDate, [item]);
  }
  return [...days].map(([localDate, dayItems]) => ({ localDate, items: dayItems }));
}

/** The loaded pages as one list, in order; a session repeated by a later page shows once. */
export function mergeHistoryPages(
  pages: readonly { items: readonly SessionHistoryItem[] }[],
): SessionHistoryItem[] {
  const seen = new Set<string>();
  const items: SessionHistoryItem[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

/**
 * A date-only value (`YYYY-MM-DD`) as that calendar day, e.g. "Wednesday, September 30, 2026".
 * It is read and formatted in UTC, so the device's time zone can never move it to another day.
 * No Today or Yesterday: the device's today may not be the day in the user's time zone.
 */
export function formatLocalDate(localDate: string, locale?: string): string {
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The session's start as a clock time on this device, e.g. "9:05 AM". */
export function formatStartTime(instant: string, locale?: string): string {
  return new Date(instant).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/** The server's focused time in whole minutes: "<1 min", "25 min", "1 h 35 min". */
export function formatFocused(milliseconds: number): string {
  const minutes = Math.floor(Math.max(0, milliseconds) / MINUTE);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** The outcome in calm words (docs/02), from the server's status and `counted`. */
export function outcomeLabel(item: Pick<SessionHistoryItem, 'status' | 'counted'>): string {
  if (!item.counted) return 'Not counted';
  return item.status === 'completed' ? 'Completed' : 'Ended early';
}
