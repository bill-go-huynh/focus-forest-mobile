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
export type SessionHistoryItem = z.infer<typeof sessionHistoryItemSchema>;

/** One page, newest first (startedAt DESC, id DESC). `nextCursor` is opaque; null at the end. */
export const historyPageSchema = z.object({
  items: z.array(sessionHistoryItemSchema),
  nextCursor: z.string().min(1).nullable(),
});
export type SessionHistoryPage = z.infer<typeof historyPageSchema>;

/**
 * GET /me/sessions: one page of the user's focus history, every status. The cursor is passed
 * back exactly as the server gave it; the client never reads it.
 */
export function getSessionHistory(
  client: ApiClient,
  { cursor }: { cursor?: string | null },
): Promise<SessionHistoryPage> {
  const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  return client.request(`/me/sessions?${params.toString()}`, { schema: historyPageSchema });
}
