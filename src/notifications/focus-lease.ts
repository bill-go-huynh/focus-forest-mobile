import type { ActiveTimerStore } from '../timer/active-timer-store';
import { derive, type TimerState } from '../timer/timer-engine';

/**
 * The focus lease (M6.1; A6.1, docs/02: nothing during an active focus session). While a timer
 * runs or is paused, solo or in a room, the server holds every notification until the lease
 * ends. The lease is planned from the stored timer, like the timer's own notification: the
 * latest instant the focus could still be going. The server adds its grace for a crashed app.
 */

/** The server refuses a lease more than a day ahead. */
const MAX_AHEAD = 24 * 60 * 60_000 - 60_000;

/**
 * When the lease should end (epoch ms), or null when nothing is focusing: the completion while
 * running; while paused, the pause limit plus the focus still to come.
 */
export function planFocusLease(timer: TimerState | null, now: number): number | null {
  if (!timer) return null;
  // An ended timer, or one past its completion or pause limit, derives as finished.
  const view = derive(timer, now);
  const end =
    view.mode === 'running'
      ? view.completionAt
      : view.mode === 'paused' && view.pauseLimitAt !== null
        ? view.pauseLimitAt + view.remainingMilliseconds
        : null;
  if (end === null) return null;
  return Math.min(end, now + MAX_AHEAD);
}

export interface FocusLeaseApi {
  set(endsAt: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Keeps the server's lease in line with the signed-in user's stored timer. It follows the timer
 * store; a run sends only a change. Runs one at a time, the latest state winning. A failure is
 * reported and tried again on the next run (a change, or the foreground); it never reaches the
 * timer. On sign-out the lease is forgotten without a call: the server's grace ends it.
 */
export class FocusLeaseCoordinator {
  /** What the server was last told for this user: an end, or none. */
  private sent: { userId: string; endsAt: number | null } | null = null;
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    private readonly options: {
      timers: ActiveTimerStore;
      api: FocusLeaseApi;
      now: () => number;
      report: (issue: { code: string }) => void;
    },
  ) {}

  /** Follows the timer store. Returns the unsubscribe. */
  start(): () => void {
    void this.reconcile();
    return this.options.timers.subscribe(() => void this.reconcile());
  }

  /** Whether the signed-in user has a timer that runs or is paused. */
  focusing(): boolean {
    const { timer } = this.options.timers.getSnapshot();
    return timer !== null && timer.finished === null;
  }

  reconcile(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    const run = (async () => {
      do {
        this.again = false;
        await this.reconcileOnce();
      } while (this.again);
    })();
    this.running = run;
    const done = () => {
      if (this.running === run) this.running = null;
    };
    void run.then(done, done);
    return run;
  }

  /** Resolves when no run is in progress. */
  idle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private async reconcileOnce(): Promise<void> {
    const { status, userId, timer } = this.options.timers.getSnapshot();
    if (status !== 'ready' || !userId) {
      // Signed out, or the timer is not known yet: nothing to tell the server.
      if (!userId) this.sent = null;
      return;
    }
    const endsAt = planFocusLease(timer, this.options.now());
    const known = this.sent?.userId === userId ? this.sent.endsAt : undefined;
    // A first look with nothing focusing sends nothing: there is no lease to clear.
    if (known === endsAt || (known === undefined && endsAt === null)) {
      this.sent = { userId, endsAt };
      return;
    }
    try {
      if (endsAt === null) await this.options.api.clear();
      else await this.options.api.set(new Date(endsAt).toISOString());
      this.sent = { userId, endsAt };
    } catch {
      this.options.report({ code: 'lease_failed' });
    }
  }
}
