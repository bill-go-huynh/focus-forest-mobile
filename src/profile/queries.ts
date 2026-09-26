import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getProfile, updateProfile, useApi, type Profile, type ProfileChanges } from '../api';

export const profileQueryKey = ['me', 'profile'] as const;

/** The signed-in user's profile (A4: GET /me/profile). */
export function useProfile() {
  const { client } = useApi();
  return useQuery({ queryKey: profileQueryKey, queryFn: () => getProfile(client) });
}

/** Saves profile changes (A4: PATCH /me/profile) and keeps the cached profile in step. */
export function useUpdateProfile() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: ProfileChanges) => updateProfile(client, changes),
    onSuccess: (profile: Profile) => queryClient.setQueryData(profileQueryKey, profile),
  });
}
