import { z } from 'zod';

import type { ApiClient } from './client';

/** The answer of POST /me/analytics/events (CR.1): kept and ignored counts. */
export const analyticsBatchSchema = z.object({
  accepted: z.number().int().nonnegative(),
  ignored: z.number().int().nonnegative(),
});

/** Sends queued product events (at most 50). The server keeps each id once. */
export function sendAnalyticsEvents(
  client: ApiClient,
  events: readonly {
    id: string;
    name: string;
    occurredAt: string;
    localDate: string;
    platform: string;
    appVersion: string;
    props: Record<string, number>;
  }[],
): Promise<z.infer<typeof analyticsBatchSchema>> {
  return client.request('/me/analytics/events', {
    method: 'POST',
    body: { events },
    schema: analyticsBatchSchema,
  });
}
