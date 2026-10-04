import type {
  DayCell,
  Heatmap,
  LifetimeStats,
  MonthInsights,
  PersonalRecord,
  TopicInsight,
  WeekInsights,
} from '../api/insights';
import { TOPIC_COLORS } from '../api/topics';

/**
 * Insights answers shaped like the A3.5 contracts (GET /me/insights/week|month|heatmap|records,
 * GET /me/profile/stats). Durations in milliseconds; every value is the server's.
 */

const MIN = 60_000;

export function dayCell(date: string, overrides: Partial<DayCell> = {}): DayCell {
  const focused = overrides.focusedMilliseconds ?? 0;
  const sessions = overrides.sessionCount ?? (focused > 0 ? 1 : 0);
  return {
    date,
    focusedMilliseconds: focused,
    sessionCount: sessions,
    active: sessions > 0,
    rest: false,
    dailyGoal: 'none',
    dailyGoalMinutes: null,
    ...overrides,
  };
}

export function topicInsight(overrides: Partial<TopicInsight> = {}): TopicInsight {
  return {
    topicId: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
    name: 'Reading',
    icon: 'book',
    color: TOPIC_COLORS[0],
    status: 'active',
    focusedMilliseconds: 240 * MIN,
    sessionCount: 6,
    share: 0.6316,
    lastUsedAt: '2026-10-07T09:00:00.000Z',
    ...overrides,
  };
}

export const OLD_COURSE = topicInsight({
  topicId: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5e',
  name: 'Old course',
  icon: 'leaf',
  color: TOPIC_COLORS[3],
  status: 'archived',
  focusedMilliseconds: 140 * MIN,
  sessionCount: 3,
  share: 0.3684,
  lastUsedAt: '2026-10-06T18:00:00.000Z',
});

export const RECORDS: PersonalRecord[] = [
  { kind: 'most_focused_day', value: 185, unit: 'minutes', achievedOn: '2026-09-17' },
  { kind: 'most_focused_week', value: 540, unit: 'minutes', achievedOn: '2026-09-14' },
  { kind: 'most_focused_month', value: 1510, unit: 'minutes', achievedOn: '2026-09-01' },
  { kind: 'longest_streak', value: 12, unit: 'days', achievedOn: '2026-08-20' },
  { kind: 'longest_session', value: 95, unit: 'minutes', achievedOn: '2026-10-02' },
  { kind: 'longest_daily_goal_streak', value: 6, unit: 'days', achievedOn: '2026-09-12' },
];

/** The week of Monday 5 October 2026 (the current one): 6 h 20 min over 9 sessions, 4 days. */
export function makeWeek(overrides: Partial<WeekInsights> = {}): WeekInsights {
  const days = [
    dayCell('2026-10-05', {
      focusedMilliseconds: 90 * MIN,
      sessionCount: 2,
      dailyGoal: 'met',
      dailyGoalMinutes: 60,
    }),
    dayCell('2026-10-06', {
      focusedMilliseconds: 80 * MIN,
      sessionCount: 3,
      rest: true,
      dailyGoal: 'met',
      dailyGoalMinutes: 60,
    }),
    dayCell('2026-10-07', {
      focusedMilliseconds: 170 * MIN,
      sessionCount: 3,
      dailyGoal: 'met',
      dailyGoalMinutes: 60,
    }),
    dayCell('2026-10-08', {
      focusedMilliseconds: 40 * MIN,
      sessionCount: 1,
      dailyGoal: 'pending',
      dailyGoalMinutes: 60,
    }),
    dayCell('2026-10-09', { dailyGoal: 'pending', dailyGoalMinutes: 60 }),
    dayCell('2026-10-10', { dailyGoal: 'pending', dailyGoalMinutes: 60 }),
    dayCell('2026-10-11', { dailyGoal: 'pending', dailyGoalMinutes: 60 }),
  ];
  return {
    period: { kind: 'week', from: '2026-10-05', to: '2026-10-11', current: true },
    summary: {
      focusedMilliseconds: 380 * MIN,
      sessionCount: 9,
      activeDays: 4,
      averageFocusedMillisecondsPerActiveDay: 95 * MIN,
    },
    days,
    topics: [topicInsight(), OLD_COURSE],
    longestSession: {
      sessionId: '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
      topicId: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
      localDate: '2026-10-07',
      focusedMilliseconds: 95 * MIN,
    },
    goals: {
      daily: { completed: 3, eligible: 3 },
      weekly: {
        weekStart: '2026-10-05',
        type: 'session_count',
        target: 12,
        current: 9,
        completed: false,
      },
    },
    restDays: 1,
    streak: { current: 4, longest: 12, longestInPeriod: 4 },
    newRecords: [{ kind: 'longest_session', value: 95, unit: 'minutes', achievedOn: '2026-10-07' }],
    ...overrides,
  };
}

/** September 2026, archived: 25 h 10 min over 38 sessions. */
export function makeMonth(overrides: Partial<MonthInsights> = {}): MonthInsights {
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = `2026-09-${String(i + 1).padStart(2, '0')}`;
    if (i % 3 === 0)
      return dayCell(date, {
        focusedMilliseconds: 120 * MIN,
        sessionCount: 3,
        dailyGoal: 'met',
        dailyGoalMinutes: 60,
      });
    if (i % 7 === 2)
      return dayCell(date, { rest: true, dailyGoal: 'not_met', dailyGoalMinutes: 60 });
    return dayCell(date, { dailyGoal: 'not_met', dailyGoalMinutes: 60 });
  });
  return {
    period: {
      kind: 'month',
      year: 2026,
      month: 9,
      from: '2026-09-01',
      to: '2026-09-30',
      current: false,
      archived: true,
    },
    summary: {
      focusedMilliseconds: 1510 * MIN,
      sessionCount: 38,
      activeDays: 19,
      averageFocusedMillisecondsPerActiveDay: 79 * MIN,
    },
    topics: [
      topicInsight({ focusedMilliseconds: 1000 * MIN, share: 0.6623 }),
      { ...OLD_COURSE, focusedMilliseconds: 510 * MIN, share: 0.3377 },
    ],
    topTopic: topicInsight({ focusedMilliseconds: 1000 * MIN, share: 0.6623 }),
    longestSession: {
      sessionId: '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
      topicId: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
      localDate: '2026-09-17',
      focusedMilliseconds: 95 * MIN,
    },
    mostProductiveDay: { date: '2026-09-17', focusedMinutes: 185 },
    mostProductiveWeek: { weekStart: '2026-09-14', focusedMinutes: 540 },
    days,
    goals: { daily: { completed: 10, eligible: 26 }, weekly: { completed: 2, eligible: 4 } },
    restDays: 3,
    streak: { current: 4, longest: 12, longestInPeriod: 9 },
    newRecords: [
      { kind: 'most_focused_month', value: 1510, unit: 'minutes', achievedOn: '2026-09-01' },
    ],
    archivedStats: {
      focusedMinutes: 1510,
      sessionCount: 38,
      activeDays: 19,
      dailyGoalsMet: 10,
      weeklyGoalsMet: 3,
      longestStreak: 9,
      topTopic: {
        id: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
        name: 'Reading',
        icon: 'book',
        color: TOPIC_COLORS[0],
      },
    },
    ...overrides,
  };
}

export function makeHeatmap(days: DayCell[] = []): Heatmap {
  return { from: '2025-10-08', to: '2026-10-07', days };
}

export function makeLifetime(overrides: Partial<LifetimeStats> = {}): LifetimeStats {
  return {
    focusedMilliseconds: 3130 * MIN,
    sessionCount: 120,
    currentStreak: 4,
    longestStreak: 12,
    archivedTreeCount: 3,
    ...overrides,
  };
}
