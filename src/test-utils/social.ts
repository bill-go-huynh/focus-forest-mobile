import { FIRST_SESSION } from './progression';
import { treeDto } from './trees';

/**
 * A5.1–A5.3 answers shaped like focus-forest-api `src/social/dto/social.dto.ts`,
 * `src/visits/visits.dto.ts`, and `src/moderation/dto/moderation.dto.ts`. Server truth only.
 */

export const LINH_ID = '0190a000-0000-7000-8000-00000000a001';
export const KAI_ID = '0190a000-0000-7000-8000-00000000a002';

export interface RelationshipFixture {
  following: boolean;
  followedBy: boolean;
}

export function relationship({ following, followedBy }: RelationshipFixture) {
  return { following, followedBy, friends: following && followedBy };
}

export function makeSummary(
  overrides: { id?: string; username?: string | null; displayName?: string | null } = {},
  rel: RelationshipFixture = { following: false, followedBy: false },
) {
  return {
    id: overrides.id ?? LINH_ID,
    username: overrides.username === undefined ? 'linh' : overrides.username,
    displayName: overrides.displayName === undefined ? 'Linh' : overrides.displayName,
    avatarUrl: null,
    relationship: relationship(rel),
  };
}

const ALL_VISIBLE = {
  profile: true,
  forest: true,
  statistics: true,
  badges: true,
  currentTree: true,
};

export function makeVisitedProfile(
  rel: RelationshipFixture = { following: true, followedBy: true },
  visible: Partial<typeof ALL_VISIBLE> = {},
) {
  const shown = { ...ALL_VISIBLE, ...visible };
  return {
    user: {
      ...makeSummary({}, rel),
      bio: shown.profile ? 'Learning Japanese, one tree a month.' : null,
      joinDate: shown.profile ? '2026-08-01T00:00:00.000Z' : null,
      visible: shown,
    },
    currentTree: shown.currentTree ? treeDto({ stage: 'young_tree' }) : null,
    statistics: shown.statistics
      ? { focusedMinutes: 754, sessionCount: 30, currentStreak: 4, longestStreak: 8 }
      : null,
    badges: shown.badges ? { showcase: [FIRST_SESSION], recent: [FIRST_SESSION] } : null,
    forest: shown.forest ? { treeCount: 3 } : null,
    profileFrame: null,
  };
}

export const NO_REACTIONS = { fire: 0, sprout: 0, clap: 0, heart: 0, sparkles: 0 };

export function makeReactionSummary(
  target: string,
  counts: Partial<typeof NO_REACTIONS> = {},
  mine: string[] = [],
) {
  return { target, counts: { ...NO_REACTIONS, ...counts }, mine };
}

const EMPTY_GARDEN = {
  background: null,
  decoration: null,
  fauna: null,
  weather: null,
  effect: null,
};

export function makeVisitedForest() {
  return {
    items: [
      { kind: 'growing', year: 2026, month: 10, tree: treeDto({ stage: 'sprout' }) },
      {
        kind: 'archived',
        year: 2026,
        month: 9,
        tree: treeDto({ stage: 'mature_tree', status: 'archived', month: 9 }),
      },
      { kind: 'resting', year: 2026, month: 8 },
    ],
    nextCursor: null,
    summary: { treeCount: 1 },
    progression: { level: 1, maxLevel: 6, treeCount: 1, nextLevelAt: 3, unlockedAreas: [] },
    equipment: EMPTY_GARDEN,
  };
}

export function makeVisitedMonth() {
  return {
    kind: 'archived',
    year: 2026,
    month: 9,
    archivedAt: '2026-10-01T00:00:00.000Z',
    tree: treeDto({ stage: 'mature_tree', status: 'archived', month: 9 }),
    badges: [FIRST_SESSION],
    stats: {
      focusedMinutes: 1260,
      sessionCount: 31,
      activeDays: 18,
      dailyGoalsMet: 12,
      weeklyGoalsMet: 3,
      longestStreak: 9,
    },
  };
}

export function makePrivacy(overrides: Record<string, unknown> = {}) {
  return {
    profile: 'friends',
    forest: 'friends',
    statistics: 'private',
    badges: 'friends',
    currentTree: 'friends',
    leaderboards: false,
    ...overrides,
  };
}

export function makeWarning(overrides: Record<string, unknown> = {}): {
  id: string;
  message: string;
  createdAt: string;
  acknowledgedAt: string | null;
} {
  return {
    id: '0190a000-0000-7000-8000-00000000b001',
    message: 'Please keep your bio kind.',
    createdAt: '2026-10-08T10:00:00.000Z',
    acknowledgedAt: null,
    ...overrides,
  };
}
