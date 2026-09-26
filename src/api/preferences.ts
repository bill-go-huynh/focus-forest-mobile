import { z } from 'zod';

import type { ApiClient } from './client';

/** A5: the signed-in user's preferences (GET and PATCH /me/preferences). */
const setting = z.object({ enabled: z.boolean() });
const reminder = setting.extend({ time: z.string().nullable() });

export const preferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  sound: z.boolean(),
  haptics: z.boolean(),
  reducedMotion: z.boolean(),
  notifications: z.object({
    dailyGoalReminder: reminder,
    scheduledFocusReminder: reminder,
    streakReminder: reminder,
    eventStart: setting,
    eventEndingSoon: setting,
    friendInvite: setting,
    focusRoomInvite: setting,
    challengeUpdate: setting,
    badgeUnlocked: setting,
    monthlyRecapReady: setting,
  }),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export type NotificationCategory = keyof Preferences['notifications'];

/** Any subset of A5's fields. Each changes independently. */
export interface PreferenceChanges {
  theme?: Preferences['theme'];
  sound?: boolean;
  haptics?: boolean;
  reducedMotion?: boolean;
  notifications?: Partial<
    Record<NotificationCategory, { enabled?: boolean; time?: string | null }>
  >;
}

export function getPreferences(client: ApiClient): Promise<Preferences> {
  return client.request('/me/preferences', { schema: preferencesSchema });
}

export function updatePreferences(
  client: ApiClient,
  changes: PreferenceChanges,
): Promise<Preferences> {
  return client.request('/me/preferences', {
    method: 'PATCH',
    body: changes,
    schema: preferencesSchema,
  });
}
