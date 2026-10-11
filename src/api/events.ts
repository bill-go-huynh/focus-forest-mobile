import { z } from 'zod';

import type { ApiClient } from './client';
import { HttpError } from './errors';
import { badgeSchema, cosmeticSchema } from './progression';

/**
 * Events and the Community Tree (A5.6–A5.7, focus-forest-api `src/events/`): time-bound content
 * whose missions count the user's normal focus, milestone rewards owned forever, Home's one card,
 * what a session did for an event, and a shared tree that never loses progress. Server truth only.
 */

const instant = z.iso.datetime();
const count = z.number().int().nonnegative();

/** A string: later phases may add phases or measures; an unknown one is shown plainly. */
export const eventPhaseSchema = z.string();

export const communityStageSchema = z.string();

export const eventSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  artworkId: z.string(),
  phase: eventPhaseSchema,
  startsAt: instant,
  endsAt: instant,
  joined: z.boolean(),
  communityTree: z
    .object({ stage: communityStageSchema.nullable(), totalMinutes: count })
    .nullable(),
  missions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      measure: z.string(),
      target: z.number().int().positive(),
      dailyMinutes: count,
      /** Null until joined. */
      value: count.nullable(),
      completed: z.boolean(),
    }),
  ),
  milestones: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      requiredMissions: z.number().int().positive(),
      reached: z.boolean(),
      rewards: z.object({
        badge: badgeSchema.nullable(),
        cosmetic: cosmeticSchema.nullable(),
        traitId: z.string().nullable(),
      }),
    }),
  ),
});
export type EventInfo = z.infer<typeof eventSchema>;
export type EventMission = EventInfo['missions'][number];
export type EventMilestone = EventInfo['milestones'][number];

export const eventListSchema = z.object({ items: z.array(eventSchema) });
export type EventList = z.infer<typeof eventListSchema>;

export { eventCardSchema, type EventCard } from './event-card';

/** What one session did for a joined event, stored with the session (A5.6–A5.7). */
export const sessionEventResultSchema = z.object({
  eventId: z.string(),
  missions: z.array(
    z.object({ id: z.string(), value: count, target: count, completed: z.boolean() }),
  ),
  newlyCompletedMissionIds: z.array(z.string()),
  newlyReachedMilestoneIds: z.array(z.string()),
  community: z
    .object({ minutes: count, totalMinutes: count, reachedStages: z.array(z.string()) })
    .nullable(),
});
export type SessionEventResult = z.infer<typeof sessionEventResultSchema>;

/** The Community Tree: a shared number, never a list of people (docs/02). */
export const communityTreeSchema = z.object({
  eventId: z.string(),
  name: z.string(),
  artworkId: z.string(),
  stage: communityStageSchema.nullable(),
  totalMinutes: count,
  participants: count,
  joined: z.boolean(),
  /** The viewer's own minutes, for them only; null until joined. */
  yourMinutes: count.nullable(),
  milestones: z.array(
    z.object({
      stage: communityStageSchema,
      thresholdMinutes: z.number().int().positive(),
      reached: z.boolean(),
      reachedAt: instant.nullable(),
      rewards: z.object({ badge: badgeSchema.nullable(), cosmetic: cosmeticSchema.nullable() }),
    }),
  ),
  /** Shared rewards received and not yet celebrated: shown once (docs/04). */
  celebrate: z.array(communityStageSchema),
});
export type CommunityTree = z.infer<typeof communityTreeSchema>;

export function getEvents(client: ApiClient) {
  return client.request('/events', { schema: eventListSchema });
}

export function getEvent(client: ApiClient, id: string) {
  return client.request(`/events/${id}`, { schema: eventSchema });
}

export function joinEvent(client: ApiClient, id: string) {
  return client.request(`/events/${id}/join`, { method: 'POST', schema: eventSchema });
}

export function getCommunityTree(client: ApiClient, eventId: string) {
  return client.request(`/events/${eventId}/community-tree`, { schema: communityTreeSchema });
}

export function markCommunityCelebrated(
  client: ApiClient,
  eventId: string,
  stages: string[],
): Promise<void> {
  return client.request(`/events/${eventId}/community-tree/celebrations`, {
    method: 'POST',
    body: { stages },
  });
}

/** The stable code of a refused event request (`event_ended`, `event_entry_not_met`, …). */
export function eventErrorCode(error: unknown): string | null {
  return error instanceof HttpError ? error.code : null;
}
