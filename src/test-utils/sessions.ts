import type { FocusSession } from '../api/sessions';
import type { SessionSubmissionBody } from '../timer/submission';

/** A raw submission as toSubmission builds it: UTC instants with milliseconds. */
export function makeSubmissionBody(
  overrides: Partial<SessionSubmissionBody> = {},
): SessionSubmissionBody {
  return {
    topicId: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
    startedAt: '2026-09-27T10:00:00.000Z',
    endedAt: '2026-09-27T10:25:00.000Z',
    plannedMinutes: 25,
    pauseIntervals: [
      { startedAt: '2026-09-27T10:05:00.000Z', endedAt: '2026-09-27T10:07:00.000Z' },
    ],
    ...overrides,
  };
}

/**
 * A session exactly as PUT /me/sessions/:id answers it (A2.5, with A3.3's `growth`: null by
 * default, as for a session stored before Phase 3).
 */
export function makeSessionResult(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
    topicId: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
    startedAt: '2026-09-27T10:00:00.000Z',
    endedAt: '2026-09-27T10:25:00.000Z',
    plannedMinutes: 25,
    focusedMilliseconds: 23 * 60_000,
    pausedMilliseconds: 2 * 60_000,
    status: 'ended_early',
    counted: true,
    localDate: '2026-09-27',
    year: 2026,
    month: 9,
    note: null,
    noteHighlighted: false,
    createdAt: '2026-09-27T10:25:01.000Z',
    growth: null,
    ...overrides,
  };
}
