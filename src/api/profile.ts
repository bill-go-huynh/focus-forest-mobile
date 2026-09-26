import { z } from 'zod';

import type { ApiClient } from './client';

/** A4: the signed-in user's own profile (GET and PATCH /me/profile). */
export const profileSchema = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  joinDate: z.iso.datetime(),
  timezone: z.string().nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

/** The fields A4 lets the user change. Only the fields given are sent. */
export interface ProfileChanges {
  displayName?: string;
  bio?: string | null;
  timezone?: string;
}

export function getProfile(client: ApiClient): Promise<Profile> {
  return client.request('/me/profile', { schema: profileSchema });
}

export function updateProfile(client: ApiClient, changes: ProfileChanges): Promise<Profile> {
  return client.request('/me/profile', { method: 'PATCH', body: changes, schema: profileSchema });
}
