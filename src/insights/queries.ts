import { useQuery, type QueryClient } from '@tanstack/react-query';

import {
  getHeatmap,
  getLifetimeStats,
  getMonthInsights,
  getRecords,
  getWeekInsights,
  useApi,
  useSession,
} from '../api';

/**
 * Insights reads (A3.5), one cache entry per period so periods never mix: a week by its Monday
 * (`current` until the server names it), a month by year and month, the year's heatmap, the
 * records, and lifetime stats. Server-derived only: nothing is stored on the device, and a
 * session waiting in the outbox is never added to these numbers.
 */
export const insightsRootKey = ['me', 'insights'] as const;
export const weekInsightsKey = (weekStart: string | null) =>
  [...insightsRootKey, 'week', weekStart ?? 'current'] as const;
export const monthInsightsKey = (month: { year: number; month: number } | null) =>
  [...insightsRootKey, 'month', month ? `${month.year}-${month.month}` : 'current'] as const;
export const heatmapKey = [...insightsRootKey, 'heatmap', 'last-year'] as const;
export const recordsKey = [...insightsRootKey, 'records'] as const;
export const lifetimeStatsKey = ['me', 'profile', 'stats'] as const;

/**
 * A period read stays fresh for a few minutes: switching between Week and Month, or between
 * tabs, shows the cached period without asking again. A synced session marks it stale at once.
 */
const STALE_TIME = 5 * 60_000;

/** After the server stored a session: every period, the records, and lifetime stats are stale. */
export function invalidateInsights(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: insightsRootKey }),
    queryClient.invalidateQueries({ queryKey: lifetimeStatsKey }),
  ]).then(() => undefined);
}

export function useWeekInsights(weekStart: string | null, enabled = true) {
  const { client } = useApi();
  const { user } = useSession();
  return useQuery({
    queryKey: weekInsightsKey(weekStart),
    queryFn: () => getWeekInsights(client, weekStart),
    staleTime: STALE_TIME,
    enabled: enabled && user !== null,
  });
}

export function useMonthInsights(month: { year: number; month: number } | null, enabled = true) {
  const { client } = useApi();
  const { user } = useSession();
  return useQuery({
    queryKey: monthInsightsKey(month),
    queryFn: () => getMonthInsights(client, month),
    staleTime: STALE_TIME,
    enabled: enabled && user !== null,
  });
}

/** The last 365 days, asked only when the user opens the year. */
export function useHeatmap(enabled: boolean) {
  const { client } = useApi();
  const { user } = useSession();
  return useQuery({
    queryKey: heatmapKey,
    queryFn: () => getHeatmap(client),
    staleTime: STALE_TIME,
    enabled: enabled && user !== null,
  });
}

/** Records, asked once the period above them has loaded (staged, not all at once). */
export function useRecords(enabled: boolean) {
  const { client } = useApi();
  const { user } = useSession();
  return useQuery({
    queryKey: recordsKey,
    queryFn: () => getRecords(client),
    staleTime: STALE_TIME,
    enabled: enabled && user !== null,
  });
}

export function useLifetimeStats() {
  const { client } = useApi();
  const { user } = useSession();
  return useQuery({
    queryKey: lifetimeStatsKey,
    queryFn: () => getLifetimeStats(client),
    enabled: user !== null,
  });
}
