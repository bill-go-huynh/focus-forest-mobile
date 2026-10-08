import type { QueryClient } from '@tanstack/react-query';

import { achievementsQueryKey, badgesQueryKey, speciesQueryKey } from '../progression/query-keys';

/** The signed-in user's Home (GET /me/home); dropped with the whole cache on sign-out. */
export const homeQueryKey = ['me', 'home'] as const;

/** The current month's tree and stats (GET /me/trees/current). */
export const currentTreeQueryKey = ['me', 'trees', 'current'] as const;

/**
 * Owned badges, achievements (M4.1), and species with the month's choice (M4.2: a counted
 * session freezes it): what a stored session or recovery can change.
 */
const progressionQueryKeys = [badgesQueryKey, achievementsQueryKey, speciesQueryKey] as const;

/**
 * Marks Home, the current tree, and progression (badges, achievements) stale after the server
 * stored a session or a recovery, so screens ask the server again: progress, goals, streak, and
 * ownership are never computed on the device.
 */
export function invalidateCoreLoop(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: homeQueryKey }),
    queryClient.invalidateQueries({ queryKey: currentTreeQueryKey }),
    ...progressionQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  ]).then(() => undefined);
}
