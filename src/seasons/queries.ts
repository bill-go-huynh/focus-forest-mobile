import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSeason, setHemisphere, useApi, type Season } from '../api';

export const seasonQueryKey = ['me', 'season'] as const;

export function useSeason() {
  const { client } = useApi();
  return useQuery({ queryKey: seasonQueryKey, queryFn: () => getSeason(client) });
}

export function useSetHemisphere() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hemisphere: 'north' | 'south' | null) => setHemisphere(client, hemisphere),
    onSuccess: (season: Season) => queryClient.setQueryData(seasonQueryKey, season),
  });
}
