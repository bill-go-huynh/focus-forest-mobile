import {
  dayCell,
  makeHeatmap,
  makeLifetime,
  makeMonth,
  makeWeek,
  RECORDS,
} from '../../test-utils/insights';
import type { ApiClient } from '../client';
import { getSessionHistory } from '../history';
import {
  getHeatmap,
  getLifetimeStats,
  getMonthInsights,
  getRecords,
  getWeekInsights,
  heatmapSchema,
  lifetimeStatsSchema,
  monthInsightsSchema,
  recordsSchema,
  weekInsightsSchema,
} from '../insights';

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

describe('insights contracts (A3.5)', () => {
  it('accepts a week: seven Monday-first cells, its weekly goal progress or none', () => {
    const week = weekInsightsSchema.parse(makeWeek());
    expect(week.days.map((d) => d.date)[0]).toBe('2026-10-05');
    expect(week.goals.weekly).toMatchObject({ type: 'session_count', target: 12, current: 9 });
    expect(
      weekInsightsSchema.parse(
        makeWeek({ goals: { daily: { completed: 0, eligible: 0 }, weekly: null } }),
      ).goals.weekly,
    ).toBeNull();
  });

  it('accepts a month with goal rates and the archive’s frozen stats, or none', () => {
    const month = monthInsightsSchema.parse(makeMonth());
    expect(month.goals.weekly).toEqual({ completed: 2, eligible: 4 });
    expect(month.archivedStats?.weeklyGoalsMet).toBe(3);
    expect(monthInsightsSchema.parse(makeMonth({ archivedStats: null })).archivedStats).toBeNull();
  });

  it('keeps rest and focus on the same day, and every daily goal state', () => {
    const days = ['met', 'not_met', 'pending', 'none'].map((state, i) =>
      dayCell(`2026-10-0${i + 1}`, {
        dailyGoal: state as never,
        rest: i === 0,
        focusedMilliseconds: i === 0 ? 60_000 : 0,
      }),
    );
    const parsed = heatmapSchema.parse(makeHeatmap(days));
    expect(parsed.days[0]).toMatchObject({ rest: true, active: true });
    expect(parsed.days.map((d) => d.dailyGoal)).toEqual(['met', 'not_met', 'pending', 'none']);
  });

  it('accepts the records and lifetime stats', () => {
    expect(recordsSchema.parse({ records: RECORDS }).records).toHaveLength(6);
    expect(recordsSchema.parse({ records: [] }).records).toEqual([]);
    expect(lifetimeStatsSchema.parse(makeLifetime()).archivedTreeCount).toBe(3);
  });

  it.each([
    [
      'a share over 1',
      () => ({ ...makeWeek(), topics: [{ ...makeWeek().topics[0]!, share: 42 }] }),
    ],
    ['a week of six days', () => ({ ...makeWeek(), days: makeWeek().days.slice(1) })],
    [
      'a goal rate above its denominator',
      () => ({
        ...makeWeek(),
        goals: { ...makeWeek().goals, daily: { completed: 4, eligible: 3 } },
      }),
    ],
    [
      'an unknown daily goal state',
      () => ({
        ...makeWeek(),
        days: [
          dayCell('2026-10-05', { dailyGoal: 'missed' as never }),
          ...makeWeek().days.slice(1),
        ],
      }),
    ],
    [
      'an active day without a session',
      () => ({
        ...makeWeek(),
        days: [{ ...dayCell('2026-10-05'), active: true }, ...makeWeek().days.slice(1)],
      }),
    ],
    [
      'fractional milliseconds',
      () => ({ ...makeWeek(), summary: { ...makeWeek().summary, focusedMilliseconds: 1.5 } }),
    ],
  ])('refuses %s', (_, value) => {
    expect(weekInsightsSchema.safeParse(value()).success).toBe(false);
  });

  it('asks for a period by the server’s identity, and the current one by default', async () => {
    const { client, calls } = recordingClient();
    await getWeekInsights(client, null);
    await getWeekInsights(client, '2026-09-28');
    await getMonthInsights(client, null);
    await getMonthInsights(client, { year: 2026, month: 9 });
    await getHeatmap(client);
    await getRecords(client);
    await getLifetimeStats(client);
    expect(calls.map((c) => c.path)).toEqual([
      '/me/insights/week',
      '/me/insights/week?weekStart=2026-09-28',
      '/me/insights/month',
      '/me/insights/month?year=2026&month=9',
      '/me/insights/heatmap',
      '/me/insights/records',
      '/me/profile/stats',
    ]);
  });

  it('filters the history by the server’s names: a local-date range, a week, an attributed month, a topic', async () => {
    const { client, calls } = recordingClient();
    await getSessionHistory(client, {
      cursor: null,
      filters: { from: '2026-10-06', to: '2026-10-06' },
    });
    await getSessionHistory(client, {
      cursor: null,
      filters: { week: '2026-10-05', topicId: 'abc' },
    });
    await getSessionHistory(client, {
      cursor: 'opaque+1',
      filters: { month: { year: 2026, month: 9 } },
    });
    await getSessionHistory(client, { cursor: null });
    const params = calls.map((c) => Object.fromEntries(new URL(c.path, 'https://x').searchParams));
    expect(params).toEqual([
      { limit: '30', from: '2026-10-06', to: '2026-10-06' },
      { limit: '30', week: '2026-10-05', topicId: 'abc' },
      { limit: '30', month: '2026-09', cursor: 'opaque+1' },
      { limit: '30' },
    ]);
  });
});
