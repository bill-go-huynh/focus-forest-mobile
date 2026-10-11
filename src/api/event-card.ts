import { z } from 'zod';

/**
 * Home's one quiet event card (A5.6). Its own module: Home's schema reads it, and Home must not
 * depend on the rest of events.
 */
export const eventCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  artworkId: z.string(),
  phase: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  joined: z.boolean(),
  /** Null until joined. */
  missionsCompleted: z.number().int().nonnegative().nullable(),
  missionsTotal: z.number().int().nonnegative(),
});
export type EventCard = z.infer<typeof eventCardSchema>;
