import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getEquipment,
  getSpecies,
  progressionErrorCode,
  selectSpecies,
  useApi,
  type CurrentTreeResponse,
} from '../api';
import { currentTreeQueryKey, homeQueryKey } from '../core-loop/query-keys';
import { equipmentQueryKey, speciesQueryKey } from '../progression/query-keys';
import { environmentFrom, type SceneEnvironment } from '../tree';

/**
 * Owned species and the month's choice (GET /me/species). `enabled` lets Home ask only while
 * its tree is a Seed, the only time the choice can be open.
 */
export function useSpecies(enabled = true) {
  const { client } = useApi();
  return useQuery({ queryKey: speciesQueryKey, queryFn: () => getSpecies(client), enabled });
}

/**
 * Chooses the current month's species (PUT /me/trees/current/species). Online only, nothing
 * optimistic: the answer is the current tree, which replaces the cached one; Home and the
 * species are asked again. A refusal (`species_locked`, …) reads the species again.
 */
export function useSelectSpecies() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (speciesId: string) => selectSpecies(client, speciesId),
    onSuccess: (tree: CurrentTreeResponse) => {
      queryClient.setQueryData(currentTreeQueryKey, tree);
      void queryClient.invalidateQueries({ queryKey: homeQueryKey }).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: speciesQueryKey }).catch(() => undefined);
    },
    onError: (error) => {
      if (progressionErrorCode(error) !== null) {
        void queryClient.invalidateQueries({ queryKey: speciesQueryKey }).catch(() => undefined);
      }
    },
  });
}

/** The equipped garden and profile frame (GET /me/equipment). */
export function useEquipment() {
  const { client } = useApi();
  return useQuery({ queryKey: equipmentQueryKey, queryFn: () => getEquipment(client) });
}

/**
 * The garden to draw around the current month's tree: the equipped background and decoration,
 * or the base environment while they are not known (offline, or before the answer). Archived
 * months never ask for it.
 */
export function useGardenEnvironment(): SceneEnvironment {
  return environmentFrom(useEquipment().data);
}
