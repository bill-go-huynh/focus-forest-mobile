import { z } from 'zod';

import type { ApiClient } from './client';
import { treeStateSchema } from './core-loop';
import { archivedStatsSchema } from './forest';
import { cosmeticSchema, earnedBadgeSchema } from './progression';

/**
 * Social (A5.1–A5.3, focus-forest-api `src/social/`, `src/visits/`, `src/moderation/`): follows,
 * search, privacy-filtered profiles and forest visits, reactions, privacy settings, blocks,
 * reports, and moderator warnings. The server applies every privacy rule; the app shows what it
 * is given and never infers what is hidden.
 */

const instant = z.iso.datetime();
const count = z.number().int().nonnegative();

export const relationshipSchema = z.object({
  following: z.boolean(),
  followedBy: z.boolean(),
  /** Mutual follows (docs/02: "Friends only" means mutual follows). */
  friends: z.boolean(),
});
export type Relationship = z.infer<typeof relationshipSchema>;

export const personSchema = z.object({
  id: z.string(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  relationship: relationshipSchema,
});
export type Person = z.infer<typeof personSchema>;

const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const peoplePageSchema = page(personSchema);
export type PeoplePage = z.infer<typeof peoplePageSchema>;

export const PRIVACY_CATEGORIES = [
  'profile',
  'forest',
  'statistics',
  'badges',
  'currentTree',
] as const;
export type PrivacyCategory = (typeof PRIVACY_CATEGORIES)[number];
export const PRIVACY_LEVELS = ['public', 'friends', 'private'] as const;
export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];

export const userCardSchema = personSchema.extend({
  bio: z.string().nullable(),
  joinDate: instant.nullable(),
  /** What each category lets this viewer see. */
  visible: z.object({
    profile: z.boolean(),
    forest: z.boolean(),
    statistics: z.boolean(),
    badges: z.boolean(),
    currentTree: z.boolean(),
  }),
});

/** GET /users/:id/profile: each section null when hidden from this viewer, or empty. */
export const visitedProfileSchema = z.object({
  user: userCardSchema,
  currentTree: treeStateSchema.nullable(),
  statistics: z
    .object({
      focusedMinutes: count,
      sessionCount: count,
      currentStreak: count.nullable(),
      longestStreak: count,
    })
    .nullable(),
  badges: z
    .object({ showcase: z.array(earnedBadgeSchema), recent: z.array(earnedBadgeSchema) })
    .nullable(),
  forest: z.object({ treeCount: count }).nullable(),
  profileFrame: cosmeticSchema.nullable(),
});
export type VisitedProfile = z.infer<typeof visitedProfileSchema>;

const monthRef = { year: z.number().int(), month: z.number().int().min(1).max(12) };
const KNOWN_KINDS = ['archived', 'growing', 'resting'] as const;
const isKnownKind = (kind: string) => (KNOWN_KINDS as readonly string[]).includes(kind);

/** A visited month. No focus numbers in the timeline: the trees are the hero (docs/02). */
export const visitedForestItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('archived'), ...monthRef, tree: treeStateSchema }),
  z.object({ kind: z.literal('growing'), ...monthRef, tree: treeStateSchema.nullable() }),
  z.object({ kind: z.literal('resting'), ...monthRef }),
]);
export type VisitedForestItem = z.infer<typeof visitedForestItemSchema>;

const garden = z.object({
  background: cosmeticSchema.nullable(),
  decoration: cosmeticSchema.nullable(),
  fauna: cosmeticSchema.nullable(),
  weather: cosmeticSchema.nullable(),
  effect: cosmeticSchema.nullable(),
});

export const visitedForestSchema = z.object({
  items: z
    .array(
      z.union([
        visitedForestItemSchema,
        z.object({ kind: z.string().refine((kind) => !isKnownKind(kind)) }),
      ]),
    )
    .transform((items) =>
      items.filter((item): item is VisitedForestItem => isKnownKind(item.kind)),
    ),
  nextCursor: z.string().min(1).nullable(),
  summary: z.object({ treeCount: count }),
  progression: z.object({
    level: count,
    maxLevel: count,
    treeCount: count,
    nextLevelAt: count.nullable(),
    unlockedAreas: z.array(z.string()),
  }),
  equipment: garden,
});
export type VisitedForest = z.infer<typeof visitedForestSchema>;

export const visitedMonthSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('archived'),
    ...monthRef,
    archivedAt: instant,
    tree: treeStateSchema,
    badges: z.array(earnedBadgeSchema).nullable(),
    stats: archivedStatsSchema.omit({ topTopic: true }).nullable(),
  }),
  z.object({ kind: z.literal('growing'), ...monthRef, tree: treeStateSchema.nullable() }),
  z.object({ kind: z.literal('resting'), ...monthRef }),
]);
export type VisitedMonth = z.infer<typeof visitedMonthSchema>;

export const REACTIONS = ['fire', 'sprout', 'clap', 'heart', 'sparkles'] as const;
export type ReactionKind = (typeof REACTIONS)[number];

export const reactionSummarySchema = z.object({
  target: z.string(),
  counts: z.object({
    fire: count,
    sprout: count,
    clap: count,
    heart: count,
    sparkles: count,
  }),
  mine: z.array(z.enum(REACTIONS)),
});
export type ReactionSummary = z.infer<typeof reactionSummarySchema>;

export const receivedReactionSchema = z.object({
  id: z.string(),
  reaction: z.enum(REACTIONS),
  /** `forest`, `tree:YYYY-MM`, or `badge:<id>`. */
  target: z.string(),
  createdAt: instant,
  from: personSchema,
});
export type ReceivedReaction = z.infer<typeof receivedReactionSchema>;
export const receivedReactionsSchema = page(receivedReactionSchema);

export const privacySchema = z.object({
  profile: z.enum(PRIVACY_LEVELS),
  forest: z.enum(PRIVACY_LEVELS),
  statistics: z.enum(PRIVACY_LEVELS),
  badges: z.enum(PRIVACY_LEVELS),
  currentTree: z.enum(PRIVACY_LEVELS),
  /** A5.8: appear on leaderboards. Opt-in. */
  leaderboards: z.boolean(),
});
export type Privacy = z.infer<typeof privacySchema>;
export type PrivacyChanges = Partial<Privacy>;

export const blockedPersonSchema = z.object({
  id: z.string(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  blockedAt: instant,
});
export type BlockedPerson = z.infer<typeof blockedPersonSchema>;
export const blockedPageSchema = page(blockedPersonSchema);

export const REPORT_CATEGORIES = ['account', 'username', 'avatar', 'bio', 'behavior'] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

const filedReportSchema = z.object({
  id: z.string(),
  category: z.string(),
  status: z.string(),
  createdAt: instant,
});

export const warningSchema = z.object({
  id: z.string(),
  message: z.string(),
  createdAt: instant,
  acknowledgedAt: instant.nullable(),
});
export type Warning = z.infer<typeof warningSchema>;
const warningsSchema = z.object({ items: z.array(warningSchema) });

const query = (params: Record<string, string | null | undefined>) => {
  const search = Object.entries(params)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return search ? `?${search}` : '';
};

export function getFollowing(client: ApiClient, cursor: string | null = null) {
  return client.request(`/me/following${query({ cursor })}`, { schema: peoplePageSchema });
}

export function getFollowers(client: ApiClient, cursor: string | null = null) {
  return client.request(`/me/followers${query({ cursor })}`, { schema: peoplePageSchema });
}

export function searchPeople(client: ApiClient, q: string) {
  return client.request(`/users/search${query({ q })}`, { schema: peoplePageSchema });
}

export function follow(client: ApiClient, userId: string) {
  return client.request(`/me/following/${userId}`, { method: 'PUT', schema: personSchema });
}

export function unfollow(client: ApiClient, userId: string): Promise<void> {
  return client.request(`/me/following/${userId}`, { method: 'DELETE' });
}

export function getVisitedProfile(client: ApiClient, userId: string) {
  return client.request(`/users/${userId}/profile`, { schema: visitedProfileSchema });
}

export function getVisitedForest(client: ApiClient, userId: string, cursor: string | null) {
  return client.request(`/users/${userId}/forest${query({ cursor })}`, {
    schema: visitedForestSchema,
  });
}

export function getVisitedMonth(client: ApiClient, userId: string, year: number, month: number) {
  return client.request(`/users/${userId}/forest/${year}/${month}`, { schema: visitedMonthSchema });
}

export function getReactions(client: ApiClient, userId: string, target: string) {
  return client.request(`/users/${userId}/reactions${query({ target })}`, {
    schema: reactionSummarySchema,
  });
}

export function setReaction(
  client: ApiClient,
  userId: string,
  target: string,
  reaction: ReactionKind,
  on: boolean,
) {
  return client.request(`/users/${userId}/reactions/${reaction}${query({ target })}`, {
    method: on ? 'PUT' : 'DELETE',
    schema: reactionSummarySchema,
  });
}

export function getReceivedReactions(client: ApiClient) {
  return client.request('/me/reactions', { schema: receivedReactionsSchema });
}

export function getPrivacy(client: ApiClient) {
  return client.request('/me/privacy', { schema: privacySchema });
}

export function updatePrivacy(client: ApiClient, changes: PrivacyChanges) {
  return client.request('/me/privacy', { method: 'PATCH', body: changes, schema: privacySchema });
}

export function getBlocked(client: ApiClient) {
  return client.request('/me/blocks', { schema: blockedPageSchema });
}

export function block(client: ApiClient, userId: string): Promise<void> {
  return client.request(`/me/blocks/${userId}`, { method: 'PUT' });
}

export function unblock(client: ApiClient, userId: string): Promise<void> {
  return client.request(`/me/blocks/${userId}`, { method: 'DELETE' });
}

export function fileReport(
  client: ApiClient,
  report: { userId: string; category: ReportCategory; details: string | null },
) {
  return client.request('/me/reports', { method: 'POST', body: report, schema: filedReportSchema });
}

export function getWarnings(client: ApiClient) {
  return client.request('/me/warnings', { schema: warningsSchema });
}

export function acknowledgeWarning(client: ApiClient, id: string) {
  return client.request(`/me/warnings/${id}/acknowledged`, {
    method: 'PUT',
    schema: warningSchema,
  });
}
