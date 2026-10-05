import { z } from 'zod';

import type { ApiClient } from './client';
import { growthResultSchema } from './core-loop';
import { HttpError } from './errors';

// The API sends ids in lowercase (Postgres canonical form), in any UUID version.
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const instant = z.iso.datetime();
/** Technical bound on the planned duration (A2.4), not Product configuration. */
const PLANNED_MINUTES_MAX = 1440;

/**
 * A2.5: what PUT /me/sessions/:id answers (201 stored, 200 replay). `endedAt` is the server's
 * effective end (completion, the pause limit, or the submitted end), which may differ from the
 * submitted one. `counted` is false exactly when the status is `discarded`.
 */
export const sessionFields = z.object({
  id: uuid,
  topicId: uuid,
  startedAt: instant,
  endedAt: instant,
  plannedMinutes: z.number().int().min(1).max(PLANNED_MINUTES_MAX),
  focusedMilliseconds: z.number().int().nonnegative(),
  pausedMilliseconds: z.number().int().nonnegative(),
  status: z.enum(['completed', 'ended_early', 'discarded']),
  counted: z.boolean(),
  localDate: z.iso.date(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  note: z.string().nullable(),
  /**
   * A3.4: whether the note is highlighted for its month's Tree Details and recap. Sent in every
   * session answer (PUT, note PATCH, highlight PUT|DELETE, History). Only a session with a note
   * is highlighted; clearing the note clears it. Changing it after the month is archived changes
   * the live session only, never the archived snapshot.
   */
  noteHighlighted: z.boolean(),
  createdAt: instant,
  /**
   * A3.3: what the session did to its month's tree, in the PUT answer only (null for a session
   * stored before Phase 3). Absent from other answers (a note PATCH, History): not known there,
   * never invented.
   */
  growth: growthResultSchema.nullable().optional(),
});

/** Holds for every session answer: `counted` follows the status. */
export const countedMatchesStatus = (session: { counted: boolean; status: string }) =>
  session.counted === (session.status !== 'discarded');

export const sessionSchema = sessionFields.refine(countedMatchesStatus, {
  message: 'counted is false exactly when the session is discarded.',
});

/**
 * A session answer as the device saved it (completion receipts): one saved before X3.G read
 * `noteHighlighted` lacks it. Absent means unknown, never false; the highlight control waits
 * for a server answer that says.
 */
export const storedSessionSchema = sessionFields
  .extend({ noteHighlighted: z.boolean().optional() })
  .refine(countedMatchesStatus, {
    message: 'counted is false exactly when the session is discarded.',
  });
export type FocusSession = z.infer<typeof storedSessionSchema>;

/** The PUT answer (201 or a 200 replay) always carries `growth`, stored with the session. */
export const submittedSessionSchema = sessionFields
  .extend({ growth: growthResultSchema.nullable() })
  .refine(countedMatchesStatus, {
    message: 'counted is false exactly when the session is discarded.',
  });

/** An instant exactly as `Date.prototype.toISOString` writes it: UTC, with milliseconds. */
const canonicalInstant = z.string().refine((value) => {
  const time = Date.parse(value);
  return !Number.isNaN(time) && new Date(time).toISOString() === value;
});

const pauseSchema = z.strictObject({ startedAt: canonicalInstant, endedAt: canonicalInstant });

/**
 * The raw body of PUT /me/sessions/:id in the form the timer builds it (`toSubmission`), for
 * checking a payload the app stored before it is sent again. It checks the shape and the
 * timeline order (which the API evaluator would refuse anyway); it does not evaluate the session.
 */
export const sessionSubmissionBodySchema = z
  .strictObject({
    topicId: uuid,
    startedAt: canonicalInstant,
    endedAt: canonicalInstant,
    plannedMinutes: z.number().int().min(1).max(PLANNED_MINUTES_MAX),
    pauseIntervals: z.array(pauseSchema),
  })
  .refine((body) => isChronological(body), { message: 'The times are out of order.' });

function isChronological(body: {
  startedAt: string;
  endedAt: string;
  pauseIntervals: { startedAt: string; endedAt: string }[];
}): boolean {
  const start = Date.parse(body.startedAt);
  const end = Date.parse(body.endedAt);
  if (end < start) return false;
  let previousEnd = start;
  for (const pause of body.pauseIntervals) {
    const pauseStart = Date.parse(pause.startedAt);
    const pauseEnd = Date.parse(pause.endedAt);
    // Half-open pauses, in order, inside the session: touching pauses do not overlap.
    if (pauseStart < previousEnd || pauseEnd < pauseStart || pauseEnd > end) return false;
    previousEnd = pauseEnd;
  }
  return true;
}

/**
 * Submits a finished session with its client-generated id. The same id and body again is a
 * replay (200) that answers what was stored. This call does not retry by itself.
 */
export function submitSession(
  client: ApiClient,
  id: string,
  body: z.input<typeof sessionSubmissionBodySchema>,
): Promise<FocusSession> {
  return client.request(`/me/sessions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body,
    schema: submittedSessionSchema,
  });
}

/**
 * Sets a stored session's note (A2.6: PATCH /me/sessions/:id/note), the only part of a session
 * that can change; null clears it. Idempotent by value. Answers the whole session. The note is
 * private: never logged. This call does not retry by itself.
 */
export function updateSessionNote(
  client: ApiClient,
  id: string,
  note: string | null,
): Promise<FocusSession> {
  return client.request(`/me/sessions/${encodeURIComponent(id)}/note`, {
    method: 'PATCH',
    body: { note },
    schema: sessionSchema,
  });
}

/**
 * Highlights the note for its month's recap (PUT /me/sessions/:id/note/highlight) or removes the
 * highlight (DELETE). Idempotent; answers the whole session. A session without a note cannot be
 * highlighted (422 `note_required`). Online only: there is no queue. No retry by itself.
 */
export function setSessionNoteHighlight(
  client: ApiClient,
  id: string,
  highlighted: boolean,
): Promise<FocusSession> {
  return client.request(`/me/sessions/${encodeURIComponent(id)}/note/highlight`, {
    method: highlighted ? 'PUT' : 'DELETE',
    schema: sessionSchema,
  });
}

/**
 * The stable session error codes. 409: `session_overlap` (another saved session covers this
 * time), `session_id_conflict` (the id was used for another submission). 422: the evaluator's
 * rejections, `ends_in_future` (the device clock is ahead; the same payload succeeds later), and
 * `timezone_required` (the profile has no time zone yet). A 404 (unknown topic) is told apart
 * by its status.
 */
export type SessionErrorCode =
  | 'session_overlap'
  | 'session_id_conflict'
  | 'ends_in_future'
  | 'timezone_required'
  | 'note_required'
  | 'invalid_time'
  | 'invalid_planned_duration'
  | 'ends_before_start'
  | 'pause_ends_before_start'
  | 'pause_outside_session'
  | 'pauses_out_of_order'
  | 'pauses_overlap';

const CODES_BY_STATUS: Record<number, readonly SessionErrorCode[]> = {
  409: ['session_overlap', 'session_id_conflict'],
  422: [
    'ends_in_future',
    'timezone_required',
    'note_required',
    'invalid_time',
    'invalid_planned_duration',
    'ends_before_start',
    'pause_ends_before_start',
    'pause_outside_session',
    'pauses_out_of_order',
    'pauses_overlap',
  ],
};

export function sessionErrorCode(error: unknown): SessionErrorCode | null {
  if (!(error instanceof HttpError)) return null;
  const known = CODES_BY_STATUS[error.status] ?? [];
  return known.find((code) => code === error.code) ?? null;
}
