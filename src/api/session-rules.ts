import { z } from 'zod';

import type { ApiClient } from './client';

/**
 * GET /session-rules: the session rules the timer runs with, from the active Product
 * configuration (A2.4), with its version. Whole minutes of at least 1, as the configuration
 * registry allows. The server evaluates every submission with its own active rules; the app
 * uses these for the timer (pause limit) and for the durations it offers (minimum).
 */
export const sessionRulesSchema = z.object({
  version: z.number().int().min(1),
  minValidMinutes: z.number().int().min(1),
  maxPauseMinutes: z.number().int().min(1),
});
export type SessionRulesResponse = z.infer<typeof sessionRulesSchema>;

export function getSessionRules(client: ApiClient): Promise<SessionRulesResponse> {
  return client.request('/session-rules', { schema: sessionRulesSchema });
}
