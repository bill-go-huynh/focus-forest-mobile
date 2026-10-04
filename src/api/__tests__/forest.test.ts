import {
  archivedDetails,
  forestMonths,
  forestPage,
  makeRecap,
  SEPTEMBER,
} from '../../test-utils/forest';
import { makeCurrentTree } from '../../test-utils/core-loop';
import type { ApiClient } from '../client';
import {
  forestPageSchema,
  getForest,
  getRecap,
  getTreeDetails,
  markCeremonySeen,
  markRecapSeen,
  recapSchema,
  seenStateSchema,
  treeDetailsSchema,
} from '../forest';

function recordingClient(answer: unknown = {}) {
  const calls: { path: string; options: Record<string, unknown> }[] = [];
  const client = {
    request: jest.fn(async (path: string, options: Record<string, unknown> = {}) => {
      calls.push({ path, options });
      return answer;
    }),
  } as unknown as ApiClient;
  return { client, calls };
}

describe('forest contracts (A3.4)', () => {
  describe('forestPageSchema', () => {
    it('accepts growing, archived, and resting months, newest first, as sent', () => {
      const page = forestPageSchema.parse(forestPage(forestMonths(9), 'opaque-cursor'));
      expect(page.items.map((item) => item.kind)).toEqual([
        'growing',
        'archived',
        'archived',
        'archived',
        'resting',
        'archived',
        'archived',
        'archived',
        'resting',
      ]);
      expect(page.nextCursor).toBe('opaque-cursor');
      expect(page.summary).toEqual({ treeCount: 3, lifetimeFocusedMinutes: 4_530 });
      expect(page.progression.unlockedAreas).toEqual(['lake']);
    });

    it('leaves out kinds it does not know, keeping the others in order', () => {
      const raw = forestPage(forestMonths(3));
      const page = forestPageSchema.parse({
        ...raw,
        items: [raw.items[0], { kind: 'wildflower', year: 2026, month: 9 }, raw.items[2]],
      });
      expect(page.items.map((item) => `${item.kind}:${item.month}`)).toEqual([
        'growing:10',
        'archived:8',
      ]);
    });

    it('keeps areas this version does not know (progression is cosmetic)', () => {
      const raw = forestPage([]);
      const page = forestPageSchema.parse({
        ...raw,
        progression: { ...raw.progression, unlockedAreas: ['lake', 'aurora'] },
      });
      expect(page.progression.unlockedAreas).toEqual(['lake', 'aurora']);
    });

    it('carries each month’s focus total, zero for a resting month', () => {
      const page = forestPageSchema.parse(forestPage(forestMonths(5)));
      expect(page.items.map((item) => item.focusedMilliseconds)).toEqual([
        750 * 60_000,
        155 * 60_000,
        250 * 60_000,
        345 * 60_000,
        0,
      ]);
    });

    it.each([
      [
        'an archived month without its tree',
        { kind: 'archived', year: 2026, month: 9, focusedMilliseconds: 0 },
      ],
      ['a month 13', { kind: 'resting', year: 2026, month: 13, focusedMilliseconds: 0 }],
      ['a month without its focus total', { kind: 'resting', year: 2026, month: 9 }],
      [
        'a resting month with focus',
        { kind: 'resting', year: 2026, month: 9, focusedMilliseconds: 60_000 },
      ],
      ['a fractional total', { ...forestMonths(2)[1]!, focusedMilliseconds: 1.5 }],
    ])('refuses %s', (_, item) => {
      expect(forestPageSchema.safeParse({ ...forestPage([]), items: [item] }).success).toBe(false);
    });
  });

  describe('treeDetailsSchema', () => {
    it('accepts archived details with the snapshot stats and highlighted notes', () => {
      const details = treeDetailsSchema.parse(archivedDetails());
      expect(details.kind).toBe('archived');
      if (details.kind !== 'archived') return;
      expect(details.stats.topTopic?.name).toBe('Reading');
      expect(details.highlightedNotes).toHaveLength(1);
    });

    it('accepts a resting month and a growing one', () => {
      expect(treeDetailsSchema.parse({ kind: 'resting', ...SEPTEMBER }).kind).toBe('resting');
      expect(
        treeDetailsSchema.parse({ kind: 'growing', year: 2026, month: 10, ...makeCurrentTree() })
          .kind,
      ).toBe('growing');
    });

    it('accepts future badges and events as lists, empty or not', () => {
      expect(
        treeDetailsSchema.safeParse(archivedDetails({ badges: [{ id: 'x' }] as never[] })).success,
      ).toBe(true);
    });
  });

  describe('recapSchema and seenStateSchema', () => {
    it('accepts the stored recap with its records and seen times', () => {
      const recap = recapSchema.parse(makeRecap({ recapSeenAt: '2026-10-02T08:00:00.000Z' }));
      expect(recap.newRecords[0]).toEqual({
        kind: 'most_focused_day',
        value: 185,
        unit: 'minutes',
        achievedOn: '2026-09-17',
      });
      expect(recap.recapSeenAt).toBe('2026-10-02T08:00:00.000Z');
    });

    it('keeps a record kind this version does not know, and empty highlights', () => {
      const recap = recapSchema.parse(
        makeRecap({
          newRecords: [
            {
              kind: 'longest_focus_marathon' as never,
              value: 3,
              unit: 'days',
              achievedOn: '2026-09-03',
            },
          ],
          mostProductiveDay: null,
          mostProductiveWeek: null,
          highlightedNotes: [],
        }),
      );
      expect(recap.newRecords).toHaveLength(1);
    });

    it('accepts seen states', () => {
      expect(
        seenStateSchema.parse({ ceremonySeenAt: '2026-10-02T08:00:00.000Z', recapSeenAt: null }),
      ).toEqual({
        ceremonySeenAt: '2026-10-02T08:00:00.000Z',
        recapSeenAt: null,
      });
      expect(
        seenStateSchema.safeParse({ ceremonySeenAt: 'yesterday', recapSeenAt: null }).success,
      ).toBe(false);
    });
  });

  describe('requests', () => {
    it('pages the forest by the opaque cursor, passed back as given', async () => {
      const { client, calls } = recordingClient();
      await getForest(client, null);
      await getForest(client, 'abc+/=?&');
      expect(calls.map((c) => c.path)).toEqual([
        '/me/forest',
        `/me/forest?cursor=${encodeURIComponent('abc+/=?&')}`,
      ]);
    });

    it('reads a month and its recap, and marks the ceremony and the recap seen', async () => {
      const { client, calls } = recordingClient();
      await getTreeDetails(client, SEPTEMBER);
      await getRecap(client, SEPTEMBER);
      await markCeremonySeen(client, SEPTEMBER);
      await markRecapSeen(client, SEPTEMBER);
      expect(calls.map((c) => [c.path, c.options.method ?? 'GET'])).toEqual([
        ['/me/trees/2026/9', 'GET'],
        ['/me/trees/2026/9/recap', 'GET'],
        ['/me/trees/2026/9/ceremony-seen', 'PUT'],
        ['/me/trees/2026/9/recap-seen', 'PUT'],
      ]);
    });
  });
});
