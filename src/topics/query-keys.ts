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
