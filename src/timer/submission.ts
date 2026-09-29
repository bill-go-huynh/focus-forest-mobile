import type { Instant, TimerState } from './timer-engine';

/**
 * The raw body of PUT /me/sessions/:id (A2.5): only what the timer measured. The server derives
 * focused and paused time, status, attribution, and whether it counts.
 */
export interface SessionSubmissionBody {
  topicId: string;
  startedAt: string;
  /** The effective end: completion, the pause limit, or the user's end. */
  endedAt: string;
  plannedMinutes: number;
  pauseIntervals: { startedAt: string; endedAt: string }[];
}

export interface SessionSubmission {
  /** The path id: the same on every retry. */
  id: string;
  body: SessionSubmissionBody;
}

/**
 * The submission for a finished timer. Built from the state alone, so the same state always
 * gives the same payload: persist it as is and resend it unchanged, never with values from a
 * server response.
 */
export function toSubmission(state: TimerState): SessionSubmission {
  if (!state.finished) throw new Error('The timer has not finished; settle or end it first.');
  return {
    id: state.id,
    body: {
      topicId: state.topicId,
      startedAt: iso(state.startedAt),
      endedAt: iso(state.finished.at),
      plannedMinutes: state.plannedMinutes,
      pauseIntervals: state.pauses.map((pause) => ({
        startedAt: iso(pause.startedAt),
        endedAt: iso(pause.endedAt),
      })),
    },
  };
}

/**
 * The time focused in a submission: from start to end, less the pauses. What the timer engine
 * derived for the finished timer it was built from (tested against `derive`), for showing a
 * session the server has not answered yet. The server's evaluation stays the truth.
 */
export function focusedMillisecondsOf(body: SessionSubmissionBody): number {
  const paused = body.pauseIntervals.reduce(
    (sum, pause) => sum + (Date.parse(pause.endedAt) - Date.parse(pause.startedAt)),
    0,
  );
  return Date.parse(body.endedAt) - Date.parse(body.startedAt) - paused;
}

/** UTC with milliseconds, which the API reads as an instant with an explicit offset. */
function iso(instant: Instant): string {
  return new Date(instant).toISOString();
}
