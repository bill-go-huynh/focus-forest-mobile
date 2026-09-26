import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  getPreferences,
  updatePreferences,
  useApi,
  type PreferenceChanges,
  type Preferences,
} from '../api';

export const preferencesQueryKey = ['me', 'preferences'] as const;
const preferencesMutationKey = ['me', 'preferences', 'update'] as const;

/** The signed-in user's preferences (A5: GET /me/preferences). */
export function usePreferences({ enabled = true }: { enabled?: boolean } = {}) {
  const { client } = useApi();
  return useQuery({
    queryKey: preferencesQueryKey,
    queryFn: () => getPreferences(client),
    enabled,
  });
}

function applyChanges(current: Preferences, changes: PreferenceChanges): Preferences {
  const { notifications, ...display } = changes;
  const next = { ...current, ...display, notifications: { ...current.notifications } };
  for (const [category, setting] of Object.entries(notifications ?? {})) {
    const key = category as keyof Preferences['notifications'];
    next.notifications[key] = { ...next.notifications[key], ...setting } as never;
  }
  return next;
}

/** The current values of exactly the fields a change touches, to restore them on failure. */
function snapshotOf(current: Preferences, changes: PreferenceChanges): PreferenceChanges {
  const snapshot: PreferenceChanges = {};
  for (const key of ['theme', 'sound', 'haptics', 'reducedMotion'] as const) {
    if (changes[key] !== undefined) Object.assign(snapshot, { [key]: current[key] });
  }
  if (changes.notifications) {
    snapshot.notifications = {};
    for (const category of Object.keys(changes.notifications)) {
      const key = category as keyof Preferences['notifications'];
      snapshot.notifications[key] = { ...current.notifications[key] };
    }
  }
  return snapshot;
}

function hasOtherSaves(queryClient: QueryClient): boolean {
  return queryClient.isMutating({ mutationKey: preferencesMutationKey }) > 1;
}

/**
 * Saves one preference change (A5: PATCH /me/preferences). The change shows at once
 * (optimistic), so the theme and motion apply app-wide immediately. Saves run one at a time,
 * and only the last answer replaces the cache, so an earlier answer never undoes a later
 * change. A failed save restores only the fields it touched.
 */
export function useUpdatePreferences() {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: preferencesMutationKey,
    scope: { id: 'preferences' },
    mutationFn: (changes: PreferenceChanges) => updatePreferences(client, changes),
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: preferencesQueryKey });
      const current = queryClient.getQueryData<Preferences>(preferencesQueryKey);
      if (!current) return { snapshot: null };
      queryClient.setQueryData(preferencesQueryKey, applyChanges(current, changes));
      return { snapshot: snapshotOf(current, changes) };
    },
    onError: (_error, _changes, context) => {
      const current = queryClient.getQueryData<Preferences>(preferencesQueryKey);
      if (current && context?.snapshot) {
        queryClient.setQueryData(preferencesQueryKey, applyChanges(current, context.snapshot));
      }
    },
    onSuccess: (saved) => {
      if (!hasOtherSaves(queryClient)) queryClient.setQueryData(preferencesQueryKey, saved);
    },
  });
}
