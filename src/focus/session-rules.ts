import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { getSessionRules, sessionRulesSchema, useApi, type SessionRulesResponse } from '../api';
import {
  readStoredJson,
  type KeyValueStorage,
  type ParsedValue,
  type StorageIssue,
} from '../common/stored-json';

/**
 * The same rules apply to every user (GET /session-rules is not under /me), so one key. It
 * holds the last rules the server answered: a read cache for an offline launch, never
 * invented values.
 */
export const sessionRulesKey = 'focus-forest/session-rules/v1';

const documentSchema = z.strictObject({
  version: z.literal(1),
  rules: sessionRulesSchema.strict(),
});

function parseDocument(value: unknown): ParsedValue<SessionRulesResponse> {
  const version = (value as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version !== 1) {
    return { ok: false, reason: 'unsupported_version' };
  }
  const parsed = documentSchema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data.rules }
    : { ok: false, reason: 'invalid_state' };
}

function report(issue: StorageIssue): void {
  console.warn(`[focus] saved session rules: ${issue.code}`);
}

export type SessionRulesState =
  | { status: 'ready'; rules: SessionRulesResponse; fromDevice: boolean }
  /** Neither the server nor the device has answered yet. */
  | { status: 'loading'; rules: null }
  /** The server could not answer and none were ever saved: nothing can start. */
  | { status: 'unavailable'; rules: null; retry: () => void };

/**
 * The session rules for starting a timer: the server's answer, saved on the device for an
 * offline launch (docs/07 §4: starting a session needs no round-trip). Until the server
 * answers, the saved rules stand in; without either, nothing starts: 5 and 30 are never
 * assumed. The server evaluates each submission with its own active rules anyway (A2.5).
 */
export function useSessionRules(storage: KeyValueStorage = AsyncStorage): SessionRulesState {
  const { client } = useApi();
  const server = useQuery({
    queryKey: ['session-rules'],
    queryFn: async () => {
      const rules = await getSessionRules(client);
      try {
        await storage.setItem(sessionRulesKey, JSON.stringify({ version: 1, rules }));
      } catch {
        report({ code: 'write_failed' });
      }
      return rules;
    },
  });
  const device = useQuery({
    queryKey: ['session-rules', 'device'],
    queryFn: async () => {
      const read = await readStoredJson(storage, sessionRulesKey, parseDocument, report);
      return read.kind === 'ok' ? read.value : null;
    },
    staleTime: Infinity,
    retry: false,
  });

  if (server.data) return { status: 'ready', rules: server.data, fromDevice: false };
  if (device.data) return { status: 'ready', rules: device.data, fromDevice: true };
  if (server.isError && !device.isPending) {
    return { status: 'unavailable', rules: null, retry: () => void server.refetch() };
  }
  return { status: 'loading', rules: null };
}
