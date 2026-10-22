import { useQuery } from '@tanstack/react-query';

import { getLeaderboard, useApi, type LeaderboardPeriod, type LeaderboardScope } from '../api';

export const leaderboardKeys = {
  all: ['leaderboards'] as const,
  board: (scope: LeaderboardScope, period: LeaderboardPeriod) =>
    ['leaderboards', scope, period] as const,
};

/** One board, read as the server ranks it (A5.8). */
export function useLeaderboard(
  scope: LeaderboardScope,
  period: LeaderboardPeriod,
  { enabled = true } = {},
) {
  const { client } = useApi();
  return useQuery({
    queryKey: leaderboardKeys.board(scope, period),
    queryFn: () => getLeaderboard(client, { scope, period }),
    enabled,
    retry: false,
  });
}
