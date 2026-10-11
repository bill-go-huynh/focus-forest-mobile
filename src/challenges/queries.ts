import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  acceptChallenge,
  createChallenge,
  declineChallenge,
  getChallenge,
  getChallenges,
  getChallengeTemplates,
  inviteToChallenge,
  leaveChallenge,
  useApi,
  type Challenge,
} from '../api';

export const challengeKeys = {
  all: ['challenges'] as const,
  lists: ['challenges', 'lists'] as const,
  templates: ['challenges', 'templates'] as const,
  one: (id: string) => ['challenges', 'one', id] as const,
};

export function useChallengeLists() {
  const { client } = useApi();
  return useQuery({ queryKey: challengeKeys.lists, queryFn: () => getChallenges(client) });
}

export function useChallengeTemplates() {
  const { client } = useApi();
  return useQuery({
    queryKey: challengeKeys.templates,
    queryFn: () => getChallengeTemplates(client),
  });
}

export function useChallenge(id: string) {
  const { client } = useApi();
  return useQuery({ queryKey: challengeKeys.one(id), queryFn: () => getChallenge(client, id) });
}

/** A change that answers the challenge: it replaces the cached one; the lists are read again. */
function useChallengeChange<T>(change: (variables: T) => Promise<Challenge>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSuccess: (challenge: Challenge) => {
      queryClient.setQueryData(challengeKeys.one(challenge.id), challenge);
      void queryClient.invalidateQueries({ queryKey: challengeKeys.lists }).catch(() => undefined);
    },
  });
}

export function useCreateChallenge() {
  const { client } = useApi();
  return useChallengeChange(({ templateId, invite }: { templateId: string; invite: string[] }) =>
    createChallenge(client, templateId, invite),
  );
}

export function useInviteToChallenge(id: string) {
  const { client } = useApi();
  return useChallengeChange((userIds: string[]) => inviteToChallenge(client, id, userIds));
}

export function useAcceptChallenge() {
  const { client } = useApi();
  return useChallengeChange((id: string) => acceptChallenge(client, id));
}

/** Declining or leaving removes the user's place: no trace and no penalty (A5.5). */
export function useDropChallenge() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, how }: { id: string; how: 'decline' | 'leave' }) =>
      how === 'decline' ? declineChallenge(client, id) : leaveChallenge(client, id),
    onSuccess: (_, { id }) => {
      queryClient.removeQueries({ queryKey: challengeKeys.one(id) });
      void queryClient.invalidateQueries({ queryKey: challengeKeys.lists }).catch(() => undefined);
    },
  });
}
