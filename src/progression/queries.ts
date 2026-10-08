import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getAchievements,
  getBadges,
  progressionErrorCode,
  setShowcase,
  useApi,
  type Badges,
} from '../api';
import { achievementsQueryKey, badgesQueryKey, collectionQueryKey } from './query-keys';

/**
 * The signed-in user's badges. Read only to show them: an unlock is celebrated from the action
 * that caused it (the session or recovery answer), never from a change seen here.
 */
export function useBadges() {
  const { client } = useApi();
  return useQuery({ queryKey: badgesQueryKey, queryFn: () => getBadges(client) });
}

export function useAchievements() {
  const { client } = useApi();
  return useQuery({ queryKey: achievementsQueryKey, queryFn: () => getAchievements(client) });
}

/**
 * Replaces the showcase (PUT /me/badges/showcase) with the whole list, in order. Online only,
 * with nothing optimistic: the server's answer replaces the cached badges. A refusal (a badge
 * no longer pinnable) reads the badges again; a network failure changes nothing.
 */
export function useSetShowcase() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (badgeIds: readonly string[]) => setShowcase(client, badgeIds),
    onSuccess: (badges: Badges) => {
      queryClient.setQueryData(badgesQueryKey, badges);
      // The Collection Book marks showcased badges (`showcasePosition`).
      void queryClient.invalidateQueries({ queryKey: collectionQueryKey }).catch(() => undefined);
    },
    onError: (error) => {
      if (progressionErrorCode(error) !== null) {
        void queryClient.invalidateQueries({ queryKey: badgesQueryKey }).catch(() => undefined);
      }
    },
  });
}
