import { z } from 'zod';

import type { ApiClient } from './client';
import { badgeSchema, cosmeticSchema } from './progression';

/**
 * Seasonal content (A5.9, focus-forest-api `src/seasons/`): the theme for the user's hemisphere
 * now, which changes only the environment and atmosphere, and its limited collection, earned with
 * normal focus and owned forever.
 */

export const seasonSchema = z.object({
  hemisphere: z.enum(['north', 'south']),
  hemisphereSource: z.enum(['set', 'time_zone', 'default']),
  theme: z
    .object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      /** The art set for the environment and atmosphere; unknown ones draw nothing. */
      environmentId: z.string(),
      startsAt: z.iso.datetime(),
      endsAt: z.iso.datetime(),
    })
    .nullable(),
  rewards: z.array(
    z.discriminatedUnion('kind', [
      z.object({
        id: z.string(),
        kind: z.literal('badge'),
        item: badgeSchema,
        requiredActiveDays: z.number().int().positive(),
        activeDays: z.number().int().nonnegative(),
        owned: z.boolean(),
      }),
      z.object({
        id: z.string(),
        kind: z.literal('cosmetic'),
        item: cosmeticSchema,
        requiredActiveDays: z.number().int().positive(),
        activeDays: z.number().int().nonnegative(),
        owned: z.boolean(),
      }),
    ]),
  ),
});
export type Season = z.infer<typeof seasonSchema>;

export function getSeason(client: ApiClient) {
  return client.request('/me/season', { schema: seasonSchema });
}

/** null: derive it from the time zone again. */
export function setHemisphere(client: ApiClient, hemisphere: 'north' | 'south' | null) {
  return client.request('/me/season/hemisphere', {
    method: 'PUT',
    body: { hemisphere },
    schema: seasonSchema,
  });
}
