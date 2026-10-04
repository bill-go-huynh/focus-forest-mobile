import type { ForestItem, ForestPage, Recap, TreeDetails } from '../api/forest';
import { TOPIC_COLORS } from '../api/topics';
import { treeDto } from './trees';

/**
 * Forest, Tree Details, and Recap answers shaped like the A3.4 contracts (GET /me/forest,
 * /me/trees/:year/:month, …/recap). Newest month first, as the server orders the forest.
 */

const STAGES = ['sprout', 'young_tree', 'growing_tree', 'mature_tree', 'blooming_tree'] as const;

/** The months before `from` (inclusive), newest first. */
export function monthsBack(count: number, from = { year: 2026, month: 10 }) {
  return Array.from({ length: count }, (_, i) => {
    const index = from.year * 12 + (from.month - 1) - i;
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  });
}

/**
 * A forest of `count` months up to October 2026, newest first: the growing current month, then
 * archived trees, every fourth older month resting (a quiet month).
 */
export function forestMonths(count: number): ForestItem[] {
  return monthsBack(count).map(({ year, month }, i): ForestItem => {
    if (i === 0)
      return {
        kind: 'growing',
        year,
        month,
        tree: treeDto({ year, month, stage: 'young_tree' }),
        focusedMilliseconds: 750 * 60_000,
      };
    if (i % 4 === 0) return { kind: 'resting', year, month, focusedMilliseconds: 0 };
    const stage = STAGES[i % STAGES.length]!;
    return {
      kind: 'archived',
      year,
      month,
      tree: treeDto({ year, month, stage, status: 'archived' }),
      focusedMilliseconds: (i * 95 + 60) * 60_000,
    };
  });
}

export function forestPage(items: ForestItem[], nextCursor: string | null = null): ForestPage {
  return {
    items,
    nextCursor,
    progression: { level: 2, maxLevel: 6, treeCount: 3, nextLevelAt: 6, unlockedAreas: ['lake'] },
    summary: { treeCount: 3, lifetimeFocusedMinutes: 4_530 },
  };
}

export const SEPTEMBER = { year: 2026, month: 9 };
export const NOTE_TEXT = 'Finally understood recursion, slowly.';

export function archivedStats(overrides: Partial<Recap['stats']> = {}): Recap['stats'] {
  return {
    focusedMinutes: 1_510,
    sessionCount: 38,
    activeDays: 19,
    dailyGoalsMet: 12,
    weeklyGoalsMet: 3,
    longestStreak: 9,
    topTopic: {
      id: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
      name: 'Reading',
      icon: 'book',
      color: TOPIC_COLORS[0],
    },
    ...overrides,
  };
}

export function archivedDetails(
  overrides: Partial<Extract<TreeDetails, { kind: 'archived' }>> = {},
) {
  return {
    kind: 'archived',
    ...SEPTEMBER,
    archivedAt: '2026-10-01T00:05:00.000Z',
    tree: treeDto({
      ...SEPTEMBER,
      stage: 'mature_tree',
      status: 'archived',
      traits: ['streak-days:7'],
    }),
    stats: archivedStats(),
    highlightedNotes: [{ sessionId: '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6', note: NOTE_TEXT }],
    badges: [],
    events: [],
    ...overrides,
  } satisfies TreeDetails;
}

export function makeRecap(overrides: Partial<Recap> = {}): Recap {
  return {
    ...SEPTEMBER,
    generatedAt: '2026-10-01T00:05:00.000Z',
    tree: treeDto({ ...SEPTEMBER, stage: 'mature_tree', status: 'archived' }),
    stats: archivedStats(),
    mostProductiveDay: { date: '2026-09-17', focusedMinutes: 185 },
    mostProductiveWeek: { weekStart: '2026-09-14', focusedMinutes: 540 },
    newRecords: [
      { kind: 'most_focused_day', value: 185, unit: 'minutes', achievedOn: '2026-09-17' },
    ],
    highlightedNotes: [{ sessionId: '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6', note: NOTE_TEXT }],
    badges: [],
    events: [],
    ceremonySeenAt: null,
    recapSeenAt: null,
    ...overrides,
  };
}
