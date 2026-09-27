import { z } from 'zod';

import {
  end,
  pause,
  resume,
  settle,
  start,
  type TimerResult,
  type TimerState,
} from './timer-engine';

/**
 * Reads a timer state from untrusted storage. The shape is checked with zod; the timeline is
 * checked by replaying it through the engine (start, then each pause, resume, and end) and
 * requiring the exact same state back. So a stored timer is accepted only if the engine could
 * have written it, and no timeline rule is written twice.
 */
export type ParseResult =
  { ok: true; state: TimerState } | { ok: false; reason: 'unsupported_version' | 'invalid_state' };

const instant = z.number().refine(Number.isSafeInteger);

const shape = z.strictObject({
  version: z.literal(1),
  id: z.string(),
  topicId: z.string(),
  plannedMinutes: z.number(),
  rules: z.strictObject({ minValidMinutes: z.number(), maxPauseMinutes: z.number() }),
  startedAt: instant,
  pauses: z.array(z.strictObject({ startedAt: instant, endedAt: instant })),
  pausedAt: instant.nullable(),
  finished: z
    .strictObject({ at: instant, reason: z.enum(['completed', 'pause_limit', 'ended']) })
    .nullable(),
});

export function parseTimerState(value: unknown): ParseResult {
  // Another version is never read as this one, whatever its shape.
  const version = (value as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version !== 1) {
    return { ok: false, reason: 'unsupported_version' };
  }
  const parsed = shape.safeParse(value);
  if (!parsed.success) return { ok: false, reason: 'invalid_state' };
  const state: TimerState = parsed.data;
  const replayed = replay(state);
  return replayed && sameState(replayed, state)
    ? { ok: true, state }
    : { ok: false, reason: 'invalid_state' };
}

function replay(stored: TimerState): TimerState | null {
  const begun = start({ ...stored, now: stored.startedAt });
  if (!begun.ok) return null;
  let state: TimerState | null = begun.state;
  const step = (result: TimerResult) => (result.ok ? result.state : null);
  const lastPause = stored.pauses.length - 1;

  for (const [index, closed] of stored.pauses.entries()) {
    state = step(pause(state, closed.startedAt));
    if (!state) return null;
    // A pause open at the end was closed by the end (or the pause limit), not by a resume.
    const closedByFinish =
      stored.finished !== null &&
      stored.pausedAt === null &&
      index === lastPause &&
      closed.endedAt === stored.finished.at;
    if (closedByFinish) break;
    state = step(resume(state, closed.endedAt));
    if (!state) return null;
  }
  if (stored.pausedAt !== null) {
    state = step(pause(state, stored.pausedAt));
    if (!state) return null;
  }
  if (stored.finished) {
    const { at, reason } = stored.finished;
    if (reason === 'ended') return step(end(state, at));
    // The engine records a completion once `now >= C`, and a pause-limit end once `now > L`.
    return settle(state, reason === 'pause_limit' ? at + 1 : at);
  }
  return state;
}

function sameState(a: TimerState, b: TimerState): boolean {
  return (
    a.id === b.id &&
    a.topicId === b.topicId &&
    a.plannedMinutes === b.plannedMinutes &&
    a.rules.minValidMinutes === b.rules.minValidMinutes &&
    a.rules.maxPauseMinutes === b.rules.maxPauseMinutes &&
    a.startedAt === b.startedAt &&
    a.pausedAt === b.pausedAt &&
    a.finished?.at === b.finished?.at &&
    a.finished?.reason === b.finished?.reason &&
    a.pauses.length === b.pauses.length &&
    a.pauses.every(
      (p, i) => p.startedAt === b.pauses[i]?.startedAt && p.endedAt === b.pauses[i]?.endedAt,
    )
  );
}
