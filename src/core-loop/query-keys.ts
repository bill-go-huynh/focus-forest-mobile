import type { QueryClient } from '@tanstack/react-query';

/** The signed-in user's Home (GET /me/home); dropped with the whole cache on sign-out. */
export const homeQueryKey = ['me', 'home'] as const;

/** The current month's tree and stats (GET /me/trees/current). */
export const currentTreeQueryKey = ['me', 'trees', 'current'] as const;

/**
 * Marks Home and the current tree stale after the server stored a session, so screens ask the
 * server again: progress, goals, and streak are never computed on the device.
 */
export function invalidateCoreLoop(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: homeQueryKey }),
    queryClient.invalidateQueries({ queryKey: currentTreeQueryKey }),
  ]).then(() => undefined);
}
