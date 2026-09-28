import type { ActiveTimerStore } from '../timer/active-timer-store';
import { toSubmission } from '../timer/submission';
import type { SessionOutbox } from './session-outbox';

/**
 * `not_ready`: the timer or the outbox is not restored for the same user. `no_timer`,
 * `not_finished`: nothing to hand off. `storage_failed`: the timer's end or the outbox could not
 * be stored; the timer is kept. `id_conflict`: the outbox holds another payload under this id;
 * both are kept. `clear_failed`: the session is queued but the timer could not be removed; a
 * later handoff finds the same session queued and clears it then.
 */
export type HandoffResult =
  | { ok: true; sessionId: string }
  | {
      ok: false;
      reason:
        | 'not_ready'
        | 'no_timer'
        | 'not_finished'
        | 'storage_failed'
        | 'invalid_submission'
        | 'id_conflict'
        | 'clear_failed';
    };

/**
 * Moves the finished timer's session into the outbox without a moment where it is stored in
 * neither: the timer's end is stored, then the submission (built once, by `toSubmission`) is
 * stored in the outbox, and only then is the timer removed. Safe to repeat after a kill or a
 * failure at any step: the outbox recognizes the same session by its id and payload.
 */
export async function handoffFinishedTimer({
  timers,
  outbox,
}: {
  timers: ActiveTimerStore;
  outbox: SessionOutbox;
}): Promise<HandoffResult> {
  const { status, userId } = timers.getSnapshot();
  if (status !== 'ready' || userId === null) return { ok: false, reason: 'not_ready' };

  // Settles and stores an end that has already happened; answers what is stored.
  const current = await timers.refresh();
  if (!current.ok) {
    if (current.reason === 'no_timer' || current.reason === 'not_ready') {
      return { ok: false, reason: current.reason };
    }
    return { ok: false, reason: 'storage_failed' };
  }
  if (!current.timer.finished) return { ok: false, reason: 'not_finished' };
  if (timers.getSnapshot().userId !== userId) return { ok: false, reason: 'not_ready' };

  const submission = toSubmission(current.timer);
  const queued = await outbox.enqueue(userId, submission);
  if (!queued.ok) return { ok: false, reason: queued.reason };

  const cleared = await timers.clearFinished(submission.id);
  // Already gone (another handoff cleared it): the session is queued either way.
  if (cleared.ok || cleared.reason === 'no_timer' || cleared.reason === 'timer_mismatch') {
    return { ok: true, sessionId: submission.id };
  }
  return { ok: false, reason: 'clear_failed' };
}
