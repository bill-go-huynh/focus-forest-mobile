import { z } from 'zod';

import type { ApiClient } from './client';
import { countedMatchesStatus, sessionFields } from './sessions';
import { TOPIC_COLORS } from './topics';

// The API sends ids in lowercase (Postgres canonical form), in any UUID version.
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

/** Technical page size: the API's default (A2.7 allows 1–100). */
export const HISTORY_PAGE_SIZE = 30;

/** The topic of a history item as it is now (A2.7), loaded with the page. */
export const historyTopicSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  icon: z.string().min(1),
  color: z.enum(TOPIC_COLORS),
  status: z.enum(['active', 'archived']),
});
export type HistoryTopic = z.infer<typeof historyTopicSchema>;

/** A2.7: a stored session (the A2.5 response) plus its topic's current summary. */
export const sessionHistoryItemSchema = sessionFields
  .extend({ topic: historyTopicSchema })
  .refine(countedMatchesStatus, {
    message: 'counted is false exactly when the session is discarded.',
  })
  .refine((item) => item.topic.id === item.topicId, {
    message: 'The topic summary is the session’s topic.',
  });

/** A history item as the device saved it (the offline history): see `storedSessionSchema`. */
export const storedHistoryItemSchema = sessionFields
  .extend({ noteHighlighted: z.boolean().optional(), topic: historyTopicSchema })
  .refine(countedMatchesStatus, {
    message: 'counted is false exactly when the session is discarded.',
  })
  .refine((item) => item.topic.id === item.topicId, {
    message: 'The topic summary is the session’s topic.',
  });
export type SessionHistoryItem = z.infer<typeof storedHistoryItemSchema>;

/** One page, newest first (startedAt DESC, id DESC). `nextCursor` is opaque; null at the end. */
export const historyPageSchema = z.object({
  items: z.array(sessionHistoryItemSchema),
  nextCursor: z.string().min(1).nullable(),
});
export type SessionHistoryPage = z.infer<typeof historyPageSchema>;

/**
 * History filters as the API names them (A3.5): a local-date range (`from`/`to`, the persisted
 * local dates, inclusive), or a Monday `week` (local dates), or a `month` as sessions are
 * attributed to it (as the monthly tree counts them, which is not always the same as its
 * calendar dates); plus a topic. At most one of range, week, and month.
 */
export interface HistoryFilters {
  from?: string;
  to?: string;
  week?: string;
  month?: { year: number; month: number };
  topicId?: string;
}

/**
 * GET /me/sessions: one page of the user's focus history, every status, optionally filtered.
 * The cursor is passed back exactly as the server gave it for the same filters; the client
 * never reads it.
 */
export function getSessionHistory(
  client: ApiClient,
  { cursor, filters = {} }: { cursor?: string | null; filters?: HistoryFilters },
): Promise<SessionHistoryPage> {
  const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.week) params.set('week', filters.week);
  if (filters.month) {
    params.set('month', `${filters.month.year}-${String(filters.month.month).padStart(2, '0')}`);
  }
  if (filters.topicId) params.set('topicId', filters.topicId);
  if (cursor) params.set('cursor', cursor);
  return client.request(`/me/sessions?${params.toString()}`, { schema: historyPageSchema });
}
