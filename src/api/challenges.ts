import { z } from 'zod';

import type { ApiClient } from './client';
import { HttpError } from './errors';

/**
 * Challenges (A5.5, focus-forest-api `src/challenges/`): cooperative and consistency formats from
 * configured templates, with progress derived by the server from each participant's normal
 * counted focus. Nothing here is computed on the device.
 */

const count = z.number().int().nonnegative();
const localDate = z.iso.date();

const terms = {
  id: z.string(),
  kind: z.enum(['personal', 'friend', 'group']),
  measure: z.enum(['focus_minutes', 'sessions', 'active_days']),
  goal: z.enum(['each', 'shared']),
  target: z.number().int().positive(),
  dailyMinutes: count,
  days: z.number().int().positive(),
};

export const challengeTemplateSchema = z.object({ ...terms, maxParticipants: z.number().int() });
export type ChallengeTemplate = z.infer<typeof challengeTemplateSchema>;
export const challengeTermsSchema = z.object(terms);
export type ChallengeTerms = z.infer<typeof challengeTermsSchema>;

const challengePersonSchema = z.object({
  id: z.string(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export type ChallengePerson = z.infer<typeof challengePersonSchema>;

export const challengeSchema = z.object({
  id: z.string(),
  template: challengeTermsSchema,
  startDate: localDate,
  endDate: localDate,
  /** Never "failed": a challenge not reached simply ended. */
  phase: z.enum(['upcoming', 'active', 'completed', 'ended']),
  completedAt: z.iso.datetime().nullable(),
  /** Shared goal: everyone's total; each: the viewer's own value. */
  progress: z.object({ value: count, target: z.number().int().positive() }),
  participants: z.array(
    z.object({ user: challengePersonSchema, value: count, reached: z.boolean() }),
  ),
  invited: z.array(challengePersonSchema),
  you: z.object({ status: z.enum(['invited', 'joined']) }),
});
export type Challenge = z.infer<typeof challengeSchema>;

export const challengeListsSchema = z.object({
  current: z.array(challengeSchema),
  invitations: z.array(challengeSchema),
  finished: z.array(challengeSchema),
});
export type ChallengeLists = z.infer<typeof challengeListsSchema>;

export function getChallengeTemplates(client: ApiClient) {
  return client.request('/challenge-templates', {
    schema: z.object({ items: z.array(challengeTemplateSchema) }),
  });
}

export function getChallenges(client: ApiClient) {
  return client.request('/me/challenges', { schema: challengeListsSchema });
}

export function getChallenge(client: ApiClient, id: string) {
  return client.request(`/me/challenges/${id}`, { schema: challengeSchema });
}

export function createChallenge(client: ApiClient, templateId: string, invite: string[]) {
  return client.request('/me/challenges', {
    method: 'POST',
    body: invite.length > 0 ? { templateId, invite } : { templateId },
    schema: challengeSchema,
  });
}

export function inviteToChallenge(client: ApiClient, id: string, userIds: string[]) {
  return client.request(`/me/challenges/${id}/invite`, {
    method: 'POST',
    body: { userIds },
    schema: challengeSchema,
  });
}

export function acceptChallenge(client: ApiClient, id: string) {
  return client.request(`/me/challenges/${id}/accept`, { method: 'POST', schema: challengeSchema });
}

export function declineChallenge(client: ApiClient, id: string): Promise<void> {
  return client.request(`/me/challenges/${id}/decline`, { method: 'POST' });
}

export function leaveChallenge(client: ApiClient, id: string): Promise<void> {
  return client.request(`/me/challenges/${id}/leave`, { method: 'POST' });
}

/** The stable code of a refused challenge request (`not_a_friend`, `challenge_full`, …). */
export function challengeErrorCode(error: unknown): string | null {
  return error instanceof HttpError ? error.code : null;
}
