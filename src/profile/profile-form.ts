import { z } from 'zod';

import type { Profile, ProfileChanges } from '../api';
import { isIanaTimeZone } from '../auth/device-time-zone';

/** A4 limits (PATCH /me/profile). */
export const DISPLAY_NAME_MAX = 50;
export const BIO_MAX = 160;

/** Up to two initials from the display name, for the avatar fallback. */
export function initialsOf(displayName: string | null): string | null {
  const words = displayName?.normalize('NFC').trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length === 0) return null;
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0]!.toLocaleUpperCase())
    .join('');
}

/** "September 2026", in the profile's time zone when it has a valid one. */
export function formatJoinMonth(joinDate: string, timeZone: string | null): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    ...(timeZone && isIanaTimeZone(timeZone) ? { timeZone } : {}),
  }).format(new Date(joinDate));
}

/** "Joined September 2026". */
export function formatJoinDate(joinDate: string, timeZone: string | null): string {
  return `Joined ${formatJoinMonth(joinDate, timeZone)}`;
}

/**
 * The edit form's rules, matching A4. A name cannot be cleared once set (A4 refuses an empty
 * displayName); someone without a name yet may leave it empty.
 */
export function profileFormSchema({ hasName }: { hasName: boolean }) {
  const name = z
    .string()
    .trim()
    .max(DISPLAY_NAME_MAX, 'Keep your name to 50 characters or fewer.')
    .regex(/^\P{Cc}*$/u, 'Keep your name on one line.');
  return z.object({
    displayName: hasName ? name.min(1, 'Add the name you would like to be called.') : name,
    bio: z.string().trim().max(BIO_MAX, 'Keep your bio to 160 characters or fewer.'),
  });
}

export type ProfileFormValues = z.infer<ReturnType<typeof profileFormSchema>>;

/** Only the fields that changed. A blank bio clears it (null); a blank name is never sent. */
export function profileChanges(
  current: Pick<Profile, 'displayName' | 'bio'>,
  values: ProfileFormValues,
): ProfileChanges {
  const changes: ProfileChanges = {};
  const name = values.displayName.trim();
  if (name !== '' && name !== current.displayName) changes.displayName = name;
  const bio = values.bio.trim() || null;
  if (bio !== current.bio) changes.bio = bio;
  return changes;
}
