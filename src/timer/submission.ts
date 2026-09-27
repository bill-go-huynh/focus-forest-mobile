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

/** UTC with milliseconds, which the API reads as an instant with an explicit offset. */
function iso(instant: Instant): string {
  return new Date(instant).toISOString();
}
