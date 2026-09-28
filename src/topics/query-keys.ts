import type { QueryClient } from '@tanstack/react-query';

import type { TopicListFilter } from '../api/topics';
import { topicListVariant, type TopicListVariant } from './topic-snapshot-store';

/** Every topic list of the signed-in user (dropped with the whole cache on sign-out). */
export const topicsRootKey = ['me', 'topics'] as const;

/** One list per server query, named like `active:recent`. */
export function topicsQueryKey(filter: TopicListFilter | TopicListVariant | string = {}) {
  const variant = typeof filter === 'string' ? filter : topicListVariant(filter);
  return [...topicsRootKey, variant] as const;
}

/** The server query a list variant stands for. */
export function filterOfVariant(variant: string): TopicListFilter {
  const [status, sort] = variant.split(':');
  return {
    ...(status === 'active' || status === 'archived' ? { status } : {}),
    ...(sort === 'recent' ? { sort } : {}),
  };
}

/**
 * Marks every topic list stale, so the ones on screen are asked again (TanStack refetches active
 * queries) and the others on their next use. For changes the server derives, such as a topic's
 * last use after a session: the answers are saved like any other, and nothing is guessed locally.
 */
export function invalidateTopicLists(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: topicsRootKey });
}
