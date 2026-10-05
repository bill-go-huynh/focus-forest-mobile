import type { z } from 'zod';

import contract from '../../test-utils/x3/core-loop-contract.json';
import { goalsSchema, restDaysSchema } from '../consistency';
import { currentTreeSchema, growthResultSchema, homeSchema, streakSchema } from '../core-loop';
import { forestPageSchema, recapSchema, seenStateSchema, treeDetailsSchema } from '../forest';
import { historyPageSchema } from '../history';
import {
  heatmapSchema,
  lifetimeStatsSchema,
  monthInsightsSchema,
  recordsSchema,
  weekInsightsSchema,
} from '../insights';
import { profileSchema } from '../profile';
import { submittedSessionSchema } from '../sessions';
import { topicSchema } from '../topics';

/**
 * X3 contract drift audit: every Core Loop answer captured from the real API (HTTP + PostgreSQL,
 * focus-forest-api test/x3/contract-capture.int-spec.ts, an identical copy of the same file) is
 * parsed with the schema the app uses for it. A field the app requires that the server does not
 * send, a nullable or unit mismatch, or an unknown enum fails here. Fields the server sends that
 * the app does not read are listed exactly, so a new one is a deliberate decision.
 */

const SCHEMAS: Record<keyof typeof contract, z.ZodType> = {
  sessionFirst: submittedSessionSchema,
  sessionDiscarded: submittedSessionSchema,
  sessionOctober: submittedSessionSchema,
  sessionLate: submittedSessionSchema,
  homeGrowing: homeSchema,
  homeAfterClose: homeSchema,
  currentTree: currentTreeSchema,
  goals: goalsSchema,
  restDays: restDaysSchema,
  streak: streakSchema,
  forest: forestPageSchema,
  treeArchived: treeDetailsSchema,
  treeResting: treeDetailsSchema,
  treeGrowing: treeDetailsSchema,
  recap: recapSchema,
  ceremonySeen: seenStateSchema,
  insightsWeek: weekInsightsSchema,
  insightsMonth: monthInsightsSchema,
  heatmap: heatmapSchema,
  records: recordsSchema,
  profileStats: lifetimeStatsSchema,
  historySeptember: historyPageSchema,
  historyTopic: historyPageSchema,
  profile: profileSchema,
  topics: topicSchema.array(),
};

/** Paths of keys present in the server's answer and absent after parsing (not read by the app). */
function unread(input: unknown, parsed: unknown, path = ''): string[] {
  if (Array.isArray(input) && Array.isArray(parsed)) {
    return [...new Set(input.flatMap((item, i) => unread(item, parsed[i], `${path}[]`)))];
  }
  if (input && typeof input === 'object' && parsed && typeof parsed === 'object') {
    return Object.entries(input).flatMap(([key, value]) =>
      key in parsed
        ? unread(value, (parsed as Record<string, unknown>)[key], `${path}.${key}`)
        : [`${path}.${key}`],
    );
  }
  return [];
}

describe('X3 contract: the captured API answers parse with the app’s schemas', () => {
  it.each(Object.keys(SCHEMAS) as (keyof typeof contract)[])('%s', (name) => {
    const result = SCHEMAS[name].safeParse(contract[name]);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('lists exactly the fields the app does not read', () => {
    const ignored = Object.fromEntries(
      (Object.keys(SCHEMAS) as (keyof typeof contract)[]).map((name) => [
        name,
        unread(contract[name], SCHEMAS[name].parse(contract[name])),
      ]),
    );
    // Every field the server sends is read (X3.G: `noteHighlighted` drives the note's highlight).
    expect(
      Object.fromEntries(Object.entries(ignored).filter(([, keys]) => keys.length > 0)),
    ).toEqual({});
  });

  it('keeps the semantics each screen binds to', () => {
    const late = submittedSessionSchema.parse(contract.sessionLate);
    // A late session is saved and counted, with nothing to celebrate.
    expect(late.growth).toEqual({ counted: true, monthClosed: true, newTraits: [], tree: null });
    expect(growthResultSchema.parse(contract.sessionDiscarded.growth)).toMatchObject({
      counted: false,
    });
    expect(contract.sessionFirst.growth.stage).toEqual({ from: 'seed', to: 'sprout' });

    // Three weekly metrics, three fields: this week's progress, the month's Monday-owned rate,
    // and the archive's count by achievement date. Here they differ, so none can stand in.
    const week = weekInsightsSchema.parse(contract.insightsWeek);
    const month = monthInsightsSchema.parse(contract.insightsMonth);
    expect(week.goals.weekly).toMatchObject({ current: 280, target: 150, completed: true });
    expect(month.goals.weekly).toEqual({ completed: 0, eligible: 3 });
    expect(month.archivedStats?.weeklyGoalsMet).toBe(1);

    // The late session is in the raw numbers, never in the frozen snapshot.
    expect(month.summary.focusedMilliseconds).toBe(
      ((month.archivedStats?.focusedMinutes ?? 0) + 35) * 60_000,
    );
    const recap = recapSchema.parse(contract.recap);
    expect(recap.stats).toEqual(month.archivedStats);

    // Forest focus: the archived snapshot in ms, zero at rest, the growing month so far.
    const forest = forestPageSchema.parse(contract.forest);
    expect(forest.items.map((item) => [item.month, item.kind, item.focusedMilliseconds])).toEqual([
      [10, 'growing', 40 * 60_000],
      [9, 'archived', recap.stats.focusedMinutes * 60_000],
      [8, 'resting', 0],
    ]);

    // Archived trees carry no vitality; growing ones do.
    expect(recap.tree.vitality).toBeNull();
    expect(homeSchema.parse(contract.homeAfterClose)).toMatchObject({
      pendingCeremony: { year: 2026, month: 9 },
      tree: { year: 2026, month: 10, status: 'growing' },
    });

    // Shares are ratios; durations milliseconds; record values minutes or days.
    expect(month.topics.reduce((sum, topic) => sum + topic.share, 0)).toBeCloseTo(1, 6);
    const records = recordsSchema.parse(contract.records).records;
    expect(records.map((record) => record.kind)).toEqual([
      'most_focused_day',
      'most_focused_week',
      'most_focused_month',
      'longest_streak',
      'longest_session',
      'longest_daily_goal_streak',
    ]);
  });
});
