import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  equipCosmetic,
  getCollection,
  progressionErrorCode,
  unequipSlot,
  useApi,
  type Equipment,
  type EquipmentSlot,
} from '../api';
import { collectionQueryKey, equipmentQueryKey } from '../progression/query-keys';

/**
 * The Collection Book (GET /me/collection), derived by the server on every read. Read only to
 * show it: an unlock is celebrated from the action that caused it, never from a change here.
 */
export function useCollection() {
  const { client } = useApi();
  return useQuery({ queryKey: collectionQueryKey, queryFn: () => getCollection(client) });
}

/** A cosmetic put in its slot, or the slot emptied (`cosmeticId: null`). */
export interface EquipChange {
  slot: EquipmentSlot;
  cosmeticId: string | null;
}

/**
 * Equips or unequips (PUT|DELETE /me/equipment/:slot). Online only, with nothing optimistic:
 * the answer is the equipment, which replaces the cached one (so the garden and the profile
 * frame follow at once), and the collection is read again for its `equipped`. A refusal reads
 * both again; a network failure changes nothing.
 */
export function useEquip() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: collectionQueryKey }).catch(() => undefined);
  return useMutation({
    mutationFn: ({ slot, cosmeticId }: EquipChange) =>
      cosmeticId === null ? unequipSlot(client, slot) : equipCosmetic(client, slot, cosmeticId),
    onSuccess: (equipment: Equipment) => {
      queryClient.setQueryData(equipmentQueryKey, equipment);
      refresh();
    },
    onError: (error) => {
      if (progressionErrorCode(error) !== null) {
        refresh();
        void queryClient.invalidateQueries({ queryKey: equipmentQueryKey }).catch(() => undefined);
      }
    },
  });
}
