import type { QueryClient } from '@tanstack/react-query';

/** The signed-in user's focus history (dropped with the whole cache on sign-out). */
export const historyQueryKey = ['me', 'sessions', 'history'] as const;

/**
 * Marks the history stale, so a History on screen asks the server again (all its loaded
 * pages) and a later one asks on its next use. For a session the server has just stored:
 * nothing is added locally before the server lists it.
 */
export function invalidateHistory(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: historyQueryKey });
}
