import { z } from 'zod';

import type { ApiClient } from './client';
import { currentTreeSchema, treeStateSchema } from './core-loop';

/**
 * The forest, a month's Tree Details, and the monthly recap (A3.4). The forest is the server's
 * timeline, newest month first, every month once; the recap is the snapshot stored at archive.
 * Nothing here is recomputed: the client shows what was stored.
 */

const instant = z.iso.datetime();
const localDate = z.iso.date();
const count = z.number().int().nonnegative();
const monthRef = { year: z.number().int(), month: z.number().int().min(1).max(12) };

const KNOWN_KINDS = ['archived', 'growing', 'resting'] as const;

/**
 * A month of the forest. `focusedMilliseconds` is its counted focus for display, never growth:
 * an archived month's as frozen at archive, a growing month's so far, 0 for a resting month.
 */
export const forestItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('archived'),
    ...monthRef,
    tree: treeStateSchema,
    focusedMilliseconds: count,
  }),
  z.object({
    kind: z.literal('growing'),
    ...monthRef,
    tree: treeStateSchema,
    focusedMilliseconds: count,
  }),
  z.object({ kind: z.literal('resting'), ...monthRef, focusedMilliseconds: z.literal(0) }),
]);
export type ForestItem = z.infer<typeof forestItemSchema>;

// "Clients ignore kinds they do not know": such a month is left out, a known one is checked.
const futureKindSchema = z.object({
  kind: z.string().refine((kind) => !(KNOWN_KINDS as readonly string[]).includes(kind)),
});

export const forestPageSchema = z.object({
  items: z
    .array(z.union([forestItemSchema, futureKindSchema]))
    .transform((items) =>
      items.filter((item): item is ForestItem =>
        (KNOWN_KINDS as readonly string[]).includes(item.kind),
      ),
    ),
  nextCursor: z.string().min(1).nullable(),
  /** Cosmetic only: it may change the scenery, never a tree or a score. */
  progression: z.object({
    level: count,
    maxLevel: count,
    treeCount: count,
    nextLevelAt: count.nullable(),
    unlockedAreas: z.array(z.string()),
  }),
  summary: z.object({ treeCount: count, lifetimeFocusedMinutes: count }),
});
export type ForestPage = z.infer<typeof forestPageSchema>;

const topicSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
});

/** The month's stats as they were at archive. */
export const archivedStatsSchema = z.object({
  focusedMinutes: count,
  sessionCount: count,
  activeDays: count,
  dailyGoalsMet: count,
  weeklyGoalsMet: count,
  longestStreak: count,
  topTopic: topicSummarySchema.nullable(),
});

/** A note highlighted for its month, as it read at archive. Private: the owner only. */
const highlightedNoteSchema = z.object({ sessionId: z.string(), note: z.string() });

// Badges (Phase 8) and events (Phase 11) arrive later: kept as data, shown only when present.
const futureList = z.array(z.unknown());

export const treeDetailsSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('archived'),
    ...monthRef,
    archivedAt: instant,
    tree: treeStateSchema,
    stats: archivedStatsSchema,
    highlightedNotes: z.array(highlightedNoteSchema),
    badges: futureList,
    events: futureList,
  }),
  z.object({ kind: z.literal('growing'), ...monthRef, ...currentTreeSchema.shape }),
  z.object({ kind: z.literal('resting'), ...monthRef }),
]);
export type TreeDetails = z.infer<typeof treeDetailsSchema>;

export const recapSchema = z.object({
  ...monthRef,
  generatedAt: instant,
  tree: treeStateSchema,
  stats: archivedStatsSchema,
  mostProductiveDay: z.object({ date: localDate, focusedMinutes: count }).nullable(),
  mostProductiveWeek: z.object({ weekStart: localDate, focusedMinutes: count }).nullable(),
  /** Bests only; a kind this version does not know is kept and phrased generically. */
  newRecords: z.array(
    z.object({
      kind: z.string(),
      value: count,
      unit: z.enum(['minutes', 'days']),
      achievedOn: localDate,
    }),
  ),
  highlightedNotes: z.array(highlightedNoteSchema),
  badges: futureList,
  events: futureList,
  ceremonySeenAt: instant.nullable(),
  recapSeenAt: instant.nullable(),
});
export type Recap = z.infer<typeof recapSchema>;

export const seenStateSchema = z.object({
  ceremonySeenAt: instant.nullable(),
  recapSeenAt: instant.nullable(),
});
export type SeenState = z.infer<typeof seenStateSchema>;

export interface MonthRef {
  year: number;
  month: number;
}

/** One page of the forest; `cursor` is the previous page's `nextCursor`, passed back as given. */
export function getForest(client: ApiClient, cursor: string | null): Promise<ForestPage> {
  const query = cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`;
  return client.request(`/me/forest${query}`, { schema: forestPageSchema });
}

const monthPath = ({ year, month }: MonthRef) => `/me/trees/${year}/${month}`;

export function getTreeDetails(client: ApiClient, month: MonthRef): Promise<TreeDetails> {
  return client.request(monthPath(month), { schema: treeDetailsSchema });
}

export function getRecap(client: ApiClient, month: MonthRef): Promise<Recap> {
  return client.request(`${monthPath(month)}/recap`, { schema: recapSchema });
}

/** The month-end ceremony was shown. Idempotent: the server keeps the first time. */
export function markCeremonySeen(client: ApiClient, month: MonthRef): Promise<SeenState> {
  return client.request(`${monthPath(month)}/ceremony-seen`, {
    method: 'PUT',
    schema: seenStateSchema,
  });
}

/** The recap was viewed. Idempotent; separate from the ceremony. */
export function markRecapSeen(client: ApiClient, month: MonthRef): Promise<SeenState> {
  return client.request(`${monthPath(month)}/recap-seen`, {
    method: 'PUT',
    schema: seenStateSchema,
  });
}
