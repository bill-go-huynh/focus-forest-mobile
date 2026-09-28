import { z } from 'zod';

import type { ApiClient } from './client';
import { HttpError } from './errors';

// The API sends ids in lowercase (Postgres canonical form), in any UUID version.
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const instant = z.iso.datetime();

export const TOPIC_COLORS = Array.from({ length: 12 }, (_, i) => `topic.${i + 1}`) as [
  string,
  ...string[],
];

/**
 * A2.2 + A2.8: every topic operation answers this one shape. `lastUsedAt` and
 * `lastPlannedMinutes` come from the topic's latest session (any status), both null until it
 * has one: the picker's remembered duration.
 */
export const topicSchema = z
  .object({
    id: uuid,
    name: z.string().min(1),
    icon: z.string().min(1),
    color: z.enum(TOPIC_COLORS),
    description: z.string().nullable(),
    status: z.enum(['active', 'archived']),
    archivedAt: instant.nullable(),
    createdAt: instant,
    updatedAt: instant,
    lastUsedAt: instant.nullable(),
    lastPlannedMinutes: z.number().int().min(1).max(1440).nullable(),
  })
  .refine((topic) => (topic.status === 'archived') === (topic.archivedAt !== null), {
    message: 'archivedAt is set exactly when the topic is archived.',
  });
export type Topic = z.infer<typeof topicSchema>;
export type TopicStatus = Topic['status'];

const topicListSchema = z.array(topicSchema);

/** `status` picks the topics (both when omitted); `sort` only orders them. */
export interface TopicListFilter {
  status?: TopicStatus;
  /** Used topics by latest use, then unused ones in creation order. Default: creation order. */
  sort?: 'recent';
}

export interface NewTopicFields {
  name: string;
  icon: string;
  color: string;
  description?: string | null;
}

export type TopicChanges = Partial<NewTopicFields>;

export function listTopics(client: ApiClient, filter: TopicListFilter = {}): Promise<Topic[]> {
  const params = [
    filter.status && `status=${filter.status}`,
    filter.sort && `sort=${filter.sort}`,
  ].filter(Boolean);
  const query = params.length ? `?${params.join('&')}` : '';
  return client.request(`/me/topics${query}`, { schema: topicListSchema });
}

/**
 * Creates a topic with a client-generated lowercase id (PUT /me/topics/:id). Repeating the
 * same id and fields is a replay that answers the topic; this call does not retry by itself.
 */
export function createTopic(client: ApiClient, id: string, fields: NewTopicFields): Promise<Topic> {
  return client.request(topicPath(id), { method: 'PUT', body: fields, schema: topicSchema });
}

export function updateTopic(client: ApiClient, id: string, changes: TopicChanges): Promise<Topic> {
  return client.request(topicPath(id), { method: 'PATCH', body: changes, schema: topicSchema });
}

export function archiveTopic(client: ApiClient, id: string): Promise<Topic> {
  return client.request(`${topicPath(id)}/archive`, { method: 'POST', schema: topicSchema });
}

export function restoreTopic(client: ApiClient, id: string): Promise<Topic> {
  return client.request(`${topicPath(id)}/restore`, { method: 'POST', schema: topicSchema });
}

function topicPath(id: string): string {
  return `/me/topics/${encodeURIComponent(id)}`;
}

/**
 * The stable topic conflict codes (409). `topic_name_taken`: another active topic has the name;
 * the user picks another. `topic_id_conflict`: the id was used for a different create, a client
 * bug. A 404 (unknown topic) is told apart by its status.
 */
export type TopicErrorCode = 'topic_name_taken' | 'topic_id_conflict';

export function topicErrorCode(error: unknown): TopicErrorCode | null {
  if (!(error instanceof HttpError) || error.status !== 409) return null;
  return error.code === 'topic_name_taken' || error.code === 'topic_id_conflict'
    ? error.code
    : null;
}
