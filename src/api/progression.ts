import { z } from 'zod';

import type { ApiClient } from './client';
import { HttpError } from './errors';

const instant = z.iso.datetime();
const count = z.number().int().nonnegative();

/**
 * A4.2: a badge as the app shows it. Category and rarity are strings, not enums: later phases
 * add content (social, event, time-based badges) and an older app must still read it. Its
 * artwork is bundled in the app by `artworkId`, with a fallback for one it does not know.
 */
export const badgeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  rarity: z.string(),
  artworkId: z.string(),
});
export type Badge = z.infer<typeof badgeSchema>;

export const earnedBadgeSchema = badgeSchema.extend({ earnedAt: instant });
export type EarnedBadge = z.infer<typeof earnedBadgeSchema>;

/** A4.3: a species an action unlocked, drawn by its id (M4.2). */
const unlockedSpeciesSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  rarity: z.string(),
  baseSpeciesId: z.string().nullable(),
  unlockedAt: instant,
});

/** A4.3: a cosmetic an action unlocked; its type is also its equipment slot (M4.2). */
const unlockedCosmeticSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.string(),
  rarity: z.string(),
  artworkId: z.string(),
  unlockedAt: instant,
});

/**
 * What one action (a submitted session, an accepted recovery) caused in progression, stored
 * with it on the server and answered unchanged on replays. Only these are celebrated: a badge
 * granted by reconciling older history is never reported here, so it is never celebrated.
 */
export const progressionResultSchema = z.object({
  newlyEarnedBadges: z.array(earnedBadgeSchema),
  newlyUnlockedSpecies: z.array(unlockedSpeciesSchema),
  newlyUnlockedCosmetics: z.array(unlockedCosmeticSchema),
});
export type ProgressionResult = z.infer<typeof progressionResultSchema>;

/** Whether an action's result unlocked anything at all. */
export function unlockedAnything(result: ProgressionResult | null | undefined): boolean {
  return (
    !!result &&
    result.newlyEarnedBadges.length +
      result.newlyUnlockedSpecies.length +
      result.newlyUnlockedCosmetics.length >
      0
  );
}

/**
 * GET /me/achievements: each achievement with its badge and the server's progress. `unit` is a
 * string so a later criterion (time-based) reads as bare numbers instead of failing.
 * `completed` is exactly when the badge is owned, and then `earnedAt` is set.
 */
export const achievementSchema = z
  .object({
    id: z.string(),
    badge: badgeSchema,
    unit: z.string(),
    current: count,
    target: z.number().int().positive(),
    completed: z.boolean(),
    earnedAt: instant.nullable(),
    progressVisible: z.boolean(),
  })
  .refine((a) => a.completed === (a.earnedAt !== null), {
    message: 'earnedAt is set exactly when the achievement is completed.',
  });
export type Achievement = z.infer<typeof achievementSchema>;

export const achievementsSchema = z.object({ items: z.array(achievementSchema) });
export type Achievements = z.infer<typeof achievementsSchema>;

/** A technical bound the server enforces (A4.2), mirrored only to read its answers. */
export const SHOWCASE_MAX = 3;

/** GET /me/badges: owned badges in earned order, and the showcase in the user's order. */
export const badgesSchema = z.object({
  items: z.array(earnedBadgeSchema),
  showcase: z.array(earnedBadgeSchema).max(SHOWCASE_MAX),
});
export type Badges = z.infer<typeof badgesSchema>;

export function getAchievements(client: ApiClient): Promise<Achievements> {
  return client.request('/me/achievements', { schema: achievementsSchema });
}

export function getBadges(client: ApiClient): Promise<Badges> {
  return client.request('/me/badges', { schema: badgesSchema });
}

/** Replaces the showcase with these owned badges, in order. Answers the badges as stored. */
export function setShowcase(client: ApiClient, badgeIds: readonly string[]): Promise<Badges> {
  return client.request('/me/badges/showcase', {
    method: 'PUT',
    body: { badgeIds: [...badgeIds] },
    schema: badgesSchema,
  });
}

/** The machine-readable code of a refused progression request (`badge_not_owned`), if any. */
export function progressionErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpError) || error.status >= 500) return null;
  return error.code;
}
