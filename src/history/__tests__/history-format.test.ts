import { makeHistoryItem } from '../../test-utils/history';
import {
  formatFocused,
  formatLocalDate,
  groupByLocalDate,
  mergeHistoryPages,
  outcomeLabel,
} from '../history-format';

const MINUTE = 60_000;
const idOf = (n: number) => `0192f1a2-3b4c-7d5e-8f60-${String(n).padStart(12, '0')}`;

describe('groupByLocalDate', () => {
  it('groups by the persisted localDate, in first-occurrence order, keeping server order inside', () => {
    // Server order (startedAt DESC). After a time zone change the persisted days are not in
    // date order: the 29th comes first, then the 30th, then the 29th again, then the 28th.
    const items = [
      makeHistoryItem({
        id: idOf(1),
        localDate: '2026-09-29',
        startedAt: '2026-09-30T08:00:00.000Z',
      }),
      makeHistoryItem({
        id: idOf(2),
        localDate: '2026-09-30',
        startedAt: '2026-09-30T02:00:00.000Z',
      }),
      makeHistoryItem({
        id: idOf(3),
        localDate: '2026-09-29',
        startedAt: '2026-09-29T20:00:00.000Z',
      }),
      makeHistoryItem({
        id: idOf(4),
        localDate: '2026-09-28',
        startedAt: '2026-09-28T09:00:00.000Z',
      }),
    ];

    const groups = groupByLocalDate(items);

    expect(groups.map((g) => g.localDate)).toEqual(['2026-09-29', '2026-09-30', '2026-09-28']);
    expect(groups.map((g) => g.items.map((item) => item.id))).toEqual([
      [idOf(1), idOf(3)],
      [idOf(2)],
      [idOf(4)],
    ]);
  });

  it('never recomputes the day from startedAt in any time zone', () => {
    // 12:00 UTC on the 29th is the 29th from UTC−12 to UTC+11; the user's zone made it the 30th.
    const item = makeHistoryItem({
      localDate: '2026-09-30',
      startedAt: '2026-09-29T12:00:00.000Z',
    });

    expect(groupByLocalDate([item])).toEqual([{ localDate: '2026-09-30', items: [item] }]);
  });

  it('never re-sorts rows by topic name, duration, or creation', () => {
    const items = [
      makeHistoryItem({
        id: idOf(9),
        topic: { ...makeHistoryItem().topic, name: 'Writing' },
        focusedMilliseconds: 5 * MINUTE,
        createdAt: '2026-09-30T01:00:00.000Z',
      }),
      makeHistoryItem({
        id: idOf(2),
        topic: { ...makeHistoryItem().topic, name: 'Algebra' },
        focusedMilliseconds: 50 * MINUTE,
        createdAt: '2026-09-30T09:00:00.000Z',
      }),
    ].map((item) => ({ ...item, localDate: '2026-09-30' }));

    expect(groupByLocalDate(items)[0]?.items.map((item) => item.id)).toEqual([idOf(9), idOf(2)]);
  });
});

describe('mergeHistoryPages', () => {
  it('appends pages in order and keeps the first of any repeated id', () => {
    const a = makeHistoryItem({ id: idOf(1) });
    const b = makeHistoryItem({ id: idOf(2) });
    const bAgain = makeHistoryItem({ id: idOf(2), note: 'later copy' });
    const c = makeHistoryItem({ id: idOf(3) });

    expect(mergeHistoryPages([{ items: [a, b] }, { items: [bAgain, c] }])).toEqual([a, b, c]);
  });
});

describe('formatLocalDate', () => {
  it('formats the date-only value as that calendar day, in any device time zone', () => {
    expect(formatLocalDate('2026-09-30', 'en-US')).toBe('Wednesday, September 30, 2026');
    expect(formatLocalDate('2026-01-01', 'en-US')).toBe('Thursday, January 1, 2026');
    expect(formatLocalDate('2026-12-31', 'en-US')).toBe('Thursday, December 31, 2026');
  });
});

describe('formatFocused', () => {
  it.each([
    [0, '<1 min'],
    [59_999, '<1 min'],
    [MINUTE, '1 min'],
    [25 * MINUTE + 59_000, '25 min'],
    [60 * MINUTE, '1 h'],
    [95 * MINUTE, '1 h 35 min'],
  ])('shows %i ms as %s', (ms, text) => {
    expect(formatFocused(ms)).toBe(text);
  });
});

describe('outcomeLabel', () => {
  it('names each outcome calmly, from the server status and counted flag', () => {
    expect(outcomeLabel(makeHistoryItem({ status: 'completed', counted: true }))).toBe('Completed');
    expect(outcomeLabel(makeHistoryItem({ status: 'ended_early', counted: true }))).toBe(
      'Ended early',
    );
    expect(outcomeLabel(makeHistoryItem({ status: 'discarded', counted: false }))).toBe(
      'Not counted',
    );
  });

  it('follows the server, not the duration: a long session the server did not count', () => {
    const item = makeHistoryItem({
      status: 'discarded',
      counted: false,
      focusedMilliseconds: 90 * MINUTE,
    });
    expect(outcomeLabel(item)).toBe('Not counted');
    expect(
      outcomeLabel(
        makeHistoryItem({ status: 'ended_early', counted: true, focusedMilliseconds: 0 }),
      ),
    ).toBe('Ended early');
  });
});
