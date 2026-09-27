/**
 * The local focus timer, as pure functions over a plain JSON state (docs/06_DOMAIN_MODEL.md →
 * FocusSession, docs/07_API_BOUNDARIES.md §4). Nothing here reads the clock, storage, or the
 * network: every function takes `now`. Timestamps are the source of truth; elapsed, remaining,
 * and paused time are always derived from them, never counted down.
 *
 * The semantics match the API evaluator (A2.4), which stays authoritative:
 * - pauses are half-open [start, end), chronological, and may be empty;
 * - the session completes at the instant C the focused time reaches the plan (>=);
 * - it ends at the instant the total pause reaches `maxPauseMinutes`, but only once the pause
 *   goes past it (>): a pause of exactly the maximum may still be resumed;
 * - whichever comes first wins, and a later end settles back to it.
 */

const MINUTE_MS = 60_000;
/** The API's technical bound on the planned duration (A2.4); larger plans could never be saved. */
export const PLANNED_MINUTES_MAX = 1440;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Epoch milliseconds: JSON-safe and exact to the millisecond. */
export type Instant = number;

/** Product configuration from the API (GET /session-rules), snapshotted when the timer starts. */
export interface SessionRules {
  minValidMinutes: number;
  maxPauseMinutes: number;
}

export interface PauseInterval {
  startedAt: Instant;
  endedAt: Instant;
}

export type FinishReason = 'completed' | 'pause_limit' | 'ended';

export interface TimerState {
  version: 1;
  /** The client-generated session id (lowercase UUID), reused on every submission retry. */
  id: string;
  topicId: string;
  plannedMinutes: number;
  rules: SessionRules;
  startedAt: Instant;
  /** Closed pauses, in order. */
  pauses: PauseInterval[];
  /** The start of the open pause, or null while running or finished. */
  pausedAt: Instant | null;
  /** Set once, with the instant the session ended; never moved afterwards. */
  finished: { at: Instant; reason: FinishReason } | null;
}

export type TimerMode = 'running' | 'paused' | 'finished';

export type StartError =
  'invalid_id' | 'invalid_topic_id' | 'invalid_planned_minutes' | 'invalid_rules' | 'invalid_time';

export type ActionError =
  'already_paused' | 'not_paused' | 'finished' | 'time_went_backwards' | 'invalid_time';

/** A refused action returns the state it was given (settled when the session has finished). */
export type TimerResult =
  { ok: true; state: TimerState } | { ok: false; reason: ActionError; state: TimerState };

export interface TimerView {
  mode: TimerMode;
  finishReason: FinishReason | null;
  focusedMilliseconds: number;
  pausedMilliseconds: number;
  remainingMilliseconds: number;
  /** Focused over planned, 0 to 1. */
  progress: number;
  /** When the plan will be reached while running, or was reached; null while paused or ended otherwise. */
  completionAt: Instant | null;
  /** While paused: the instant the total pause reaches the maximum. */
  pauseLimitAt: Instant | null;
  endedAt: Instant | null;
  /**
   * Whether the focused time meets `minValidMinutes`: a preview for the end-early explanation
   * (docs/02 → Timer). The server decides whether the session counts.
   */
  reachedMinimum: boolean;
}

export interface StartInput {
  id: string;
  topicId: string;
  plannedMinutes: number;
  rules: SessionRules;
  now: Instant;
}

export function start(
  input: StartInput,
): { ok: true; state: TimerState } | { ok: false; reason: StartError } {
  const id = canonicalUuid(input.id);
  const topicId = canonicalUuid(input.topicId);
  if (!id) return { ok: false, reason: 'invalid_id' };
  if (!topicId) return { ok: false, reason: 'invalid_topic_id' };
  const { plannedMinutes, rules, now } = input;
  if (
    !Number.isInteger(plannedMinutes) ||
    plannedMinutes < 1 ||
    plannedMinutes > PLANNED_MINUTES_MAX
  ) {
    return { ok: false, reason: 'invalid_planned_minutes' };
  }
  if (!isMinutes(rules.minValidMinutes) || !isMinutes(rules.maxPauseMinutes)) {
    return { ok: false, reason: 'invalid_rules' };
  }
  if (!isInstant(now)) return { ok: false, reason: 'invalid_time' };
  return {
    ok: true,
    state: {
      version: 1,
      id,
      topicId,
      plannedMinutes,
      rules: { minValidMinutes: rules.minValidMinutes, maxPauseMinutes: rules.maxPauseMinutes },
      startedAt: now,
      pauses: [],
      pausedAt: null,
      finished: null,
    },
  };
}

export function pause(state: TimerState, now: Instant): TimerResult {
  return act(state, now, (current) => {
    if (current.pausedAt !== null) return refuse('already_paused', current);
    return { ok: true, state: { ...current, pausedAt: now } };
  });
}

export function resume(state: TimerState, now: Instant): TimerResult {
  return act(state, now, (current) => {
    if (current.pausedAt === null) return refuse('not_paused', current);
    return {
      ok: true,
      state: {
        ...current,
        pauses: [...current.pauses, { startedAt: current.pausedAt, endedAt: now }],
        pausedAt: null,
      },
    };
  });
}

/**
 * Ends the session at `now`, closing an open pause there. If it had already completed or
 * reached the pause limit, that earlier end stands; ending a finished timer changes nothing.
 */
export function end(state: TimerState, now: Instant): TimerResult {
  if (state.finished) return { ok: true, state };
  return act(state, now, (current) => ({ ok: true, state: finish(current, now, 'ended') }), true);
}

/**
 * Records a completion or pause-limit end that has happened by `now`, at the instant it
 * happened, however late the app looks. Returns the same state when nothing has happened.
 */
export function settle(state: TimerState, now: Instant): TimerState {
  if (state.finished) return state;
  const at = Math.max(now, lastEventAt(state));
  if (state.pausedAt === null) {
    const completion = completionAt(state);
    return at >= completion ? finish(state, completion, 'completed') : state;
  }
  const limit = pauseLimitAt(state, state.pausedAt);
  return at > limit ? finish(state, limit, 'pause_limit') : state;
}

/** What the timer shows at `now` (a clock earlier than the last event reads as that event). */
export function derive(state: TimerState, now: Instant): TimerView {
  const current = settle(state, now);
  const at = current.finished?.at ?? Math.max(now, lastEventAt(current));
  const closedPause = totalPause(current.pauses);
  const openPause = current.pausedAt === null ? 0 : at - current.pausedAt;
  const pausedMilliseconds = closedPause + openPause;
  const focusedMilliseconds = at - current.startedAt - pausedMilliseconds;
  const plannedMilliseconds = current.plannedMinutes * MINUTE_MS;
  const mode: TimerMode = current.finished
    ? 'finished'
    : current.pausedAt === null
      ? 'running'
      : 'paused';
  const completed = current.finished?.reason === 'completed';

  return {
    mode,
    finishReason: current.finished?.reason ?? null,
    focusedMilliseconds,
    pausedMilliseconds,
    remainingMilliseconds: plannedMilliseconds - focusedMilliseconds,
    progress: focusedMilliseconds / plannedMilliseconds,
    completionAt:
      mode === 'running' ? completionAt(current) : completed ? current.finished!.at : null,
    pauseLimitAt: mode === 'paused' ? pauseLimitAt(current, current.pausedAt!) : null,
    endedAt: current.finished?.at ?? null,
    reachedMinimum: focusedMilliseconds >= current.rules.minValidMinutes * MINUTE_MS,
  };
}

function act(
  state: TimerState,
  now: Instant,
  apply: (current: TimerState) => TimerResult,
  endsFinished = false,
): TimerResult {
  if (!isInstant(now)) return refuse('invalid_time', state);
  if (state.finished) return refuse('finished', state);
  if (now < lastEventAt(state)) return refuse('time_went_backwards', state);
  const current = settle(state, now);
  if (current.finished)
    return endsFinished ? { ok: true, state: current } : refuse('finished', current);
  return apply(current);
}

function refuse(reason: ActionError, state: TimerState): TimerResult {
  return { ok: false, reason, state };
}

function finish(state: TimerState, at: Instant, reason: FinishReason): TimerState {
  const pauses =
    state.pausedAt === null
      ? state.pauses
      : [...state.pauses, { startedAt: state.pausedAt, endedAt: at }];
  return { ...state, pauses, pausedAt: null, finished: { at, reason } };
}

/** While running: the instant the focused time reaches the plan. */
function completionAt(state: TimerState): Instant {
  return state.startedAt + state.plannedMinutes * MINUTE_MS + totalPause(state.pauses);
}

/** While paused since `pausedAt`: the instant the total pause reaches the maximum. */
function pauseLimitAt(state: TimerState, pausedAt: Instant): Instant {
  return pausedAt + state.rules.maxPauseMinutes * MINUTE_MS - totalPause(state.pauses);
}

function totalPause(pauses: readonly PauseInterval[]): number {
  return pauses.reduce((sum, pause) => sum + (pause.endedAt - pause.startedAt), 0);
}

function lastEventAt(state: TimerState): Instant {
  return Math.max(
    state.startedAt,
    state.pausedAt ?? 0,
    state.pauses.at(-1)?.endedAt ?? 0,
    state.finished?.at ?? 0,
  );
}

function canonicalUuid(value: string): string | null {
  const lower = typeof value === 'string' ? value.toLowerCase() : '';
  return UUID.test(lower) ? lower : null;
}

function isInstant(value: number): boolean {
  return Number.isSafeInteger(value);
}

/** Whole minutes, as the API's configuration holds them. */
function isMinutes(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
