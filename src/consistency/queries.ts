import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  acceptRecovery,
  cancelRestDay,
  clearWeeklyGoal,
  getGoals,
  getRestDays,
  getStreak,
  HttpError,
  scheduleRestDay,
  setDailyGoal,
  setWeeklyGoal,
  useApi,
  useSession,
  type Goals,
  type WeeklyGoal,
} from '../api';
import { invalidateCoreLoop } from '../core-loop/query-keys';

/** The signed-in user's goals, rest days, and streak; dropped with the cache on sign-out. */
export const goalsQueryKey = ['me', 'goals'] as const;
export const restDaysQueryKey = ['me', 'rest-days'] as const;
export const streakQueryKey = ['me', 'streak'] as const;

/**
 * Reads (M3.3). Writes need the server: there is no offline queue for goals, rest days, or
 * recovery, and nothing is changed on the device before the server answers. A write's answer
 * (the whole current state) replaces the cached copy as given, and Home and the current tree
 * are asked again, since a goal, a rest day, or a kept streak can change what they show.
 */
export function useGoals() {
  const { client } = useApi();
  const { user } = useSession();
  return useQuery({
    queryKey: goalsQueryKey,
    queryFn: () => getGoals(client),
    enabled: user !== null,
  });
}

export function useRestDays() {
  const { client } = useApi();
  const { user } = useSession();
  return useQuery({
    queryKey: restDaysQueryKey,
    queryFn: () => getRestDays(client),
    enabled: user !== null,
  });
}

export function useStreak() {
  const { client } = useApi();
  const { user } = useSession();
  return useQuery({
    queryKey: streakQueryKey,
    queryFn: () => getStreak(client),
    enabled: user !== null,
  });
}

/** A refusal with a reason: the cached state may be out of date, so it is asked again. */
const refused = (error: unknown) =>
  error instanceof HttpError && error.status >= 400 && error.status < 500;

function afterGoals(queryClient: QueryClient, goals: Goals) {
  queryClient.setQueryData(goalsQueryKey, goals);
  void invalidateCoreLoop(queryClient).catch(() => undefined);
}

export function useSetDailyGoal() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (minutes: number) => setDailyGoal(client, minutes),
    onSuccess: (goals) => afterGoals(queryClient, goals),
  });
}

/** Sets the weekly goal (`WeeklyGoal`) or ends it (`null`). */
export function useSetWeeklyGoal() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (goal: WeeklyGoal | null) =>
      goal ? setWeeklyGoal(client, goal) : clearWeeklyGoal(client),
    onSuccess: (goals) => afterGoals(queryClient, goals),
  });
}

/** Plans (`rest: true`) or cancels a rest day. The streak and Home follow the server. */
export function useRestDayChange() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ date, rest }: { date: string; rest: boolean }) =>
      rest ? scheduleRestDay(client, date) : cancelRestDay(client, date),
    onSuccess: (restDays) => {
      queryClient.setQueryData(restDaysQueryKey, restDays);
      void queryClient.invalidateQueries({ queryKey: streakQueryKey }).catch(() => undefined);
      void invalidateCoreLoop(queryClient).catch(() => undefined);
    },
    onError: (error) => {
      if (refused(error)) {
        void queryClient.invalidateQueries({ queryKey: restDaysQueryKey }).catch(() => undefined);
      }
    },
  });
}

/**
 * Accepts the server's recovery offer for `missedDate`. Kept only once the server says so; a
 * refusal (the offer expired meanwhile) asks for the streak again and is never retried.
 */
export function useAcceptRecovery() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (missedDate: string) => acceptRecovery(client, missedDate),
    onSuccess: (streak) => {
      queryClient.setQueryData(streakQueryKey, streak);
      // A kept streak can reach a milestone: the tree and Home are asked again.
      void invalidateCoreLoop(queryClient).catch(() => undefined);
    },
    onError: (error) => {
      if (refused(error)) {
        void queryClient.invalidateQueries({ queryKey: streakQueryKey }).catch(() => undefined);
      }
    },
  });
}
