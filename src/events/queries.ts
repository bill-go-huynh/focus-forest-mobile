import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getCommunityTree,
  getEvent,
  getEvents,
  joinEvent,
  markCommunityCelebrated,
  useApi,
  type CommunityTree,
  type EventInfo,
} from '../api';
import { homeQueryKey } from '../core-loop/query-keys';

export const eventKeys = {
  all: ['events'] as const,
  list: ['events', 'list'] as const,
  one: (id: string) => ['events', 'one', id] as const,
  community: (id: string) => ['events', 'community', id] as const,
};

export function useEvents() {
  const { client } = useApi();
  return useQuery({ queryKey: eventKeys.list, queryFn: () => getEvents(client) });
}

export function useEvent(id: string) {
  const { client } = useApi();
  return useQuery({ queryKey: eventKeys.one(id), queryFn: () => getEvent(client, id) });
}

/** Joining answers the event: it replaces the cached one; the list and Home's card are read again. */
export function useJoinEvent(id: string) {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => joinEvent(client, id),
    onSuccess: (event: EventInfo) => {
      queryClient.setQueryData(eventKeys.one(id), event);
      for (const key of [eventKeys.list, eventKeys.community(id), homeQueryKey]) {
        void queryClient.invalidateQueries({ queryKey: key }).catch(() => undefined);
      }
    },
  });
}

export function useCommunityTree(eventId: string) {
  const { client } = useApi();
  return useQuery({
    queryKey: eventKeys.community(eventId),
    queryFn: () => getCommunityTree(client, eventId),
  });
}

/** Marks the celebrations shown; only the stages named, so a later one is still celebrated. */
export function useCommunityCelebrated(eventId: string) {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stages: string[]) => markCommunityCelebrated(client, eventId, stages),
    onSuccess: (_, stages) =>
      queryClient.setQueryData<CommunityTree>(eventKeys.community(eventId), (old) =>
        old ? { ...old, celebrate: old.celebrate.filter((stage) => !stages.includes(stage)) } : old,
      ),
  });
}
