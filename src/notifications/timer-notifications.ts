import type { ActiveTimerStore } from '../timer/active-timer-store';
import { derive, type TimerState } from '../timer/timer-engine';

/**
 * Local timer notifications (docs/12: Phase 2; docs/11: the timer works with the screen
 * locked, and completion is notified when allowed). The OS announces the session's end while
 * the app is in the background or the device is locked. The notification owns nothing: what is
 * scheduled is always planned again from the stored timer (`derive`), and the OS is brought in
 * line with that plan.
 */

/** `completion`: the plan is reached at C. `pause_limit`: the pause runs out at L. */
export type TimerNotificationEvent = 'completion' | 'pause_limit';

export interface TimerNotification {
  /** One per session: `focus-timer.<session id>`. */
  identifier: string;
  userId: string;
  sessionId: string;
  event: TimerNotificationEvent;
  /** Epoch ms: C or L, exactly as the engine derives it. */
  at: number;
  sound: boolean;
  title: string;
  body: string;
}

/** Calm and factual (docs/02: no guilt): the two ends read differently. */
export const TIMER_NOTIFICATION_COPY: Record<
  TimerNotificationEvent,
  { title: string; body: string }
> = {
  completion: { title: 'Focus complete', body: 'Your focus session is ready.' },
  pause_limit: { title: 'Focus session ended', body: 'Your paused session has been saved.' },
};

export const timerNotificationId = (sessionId: string) => `focus-timer.${sessionId}`;

/**
 * The one notification a timer needs at `now`: at C while it runs, at L while it is paused,
 * none once it has ended (or is about to be settled as ended).
 */
export function planTimerNotification({
  userId,
  timer,
  now,
  sound,
}: {
  userId: string;
  timer: TimerState | null;
  now: number;
  sound: boolean;
}): TimerNotification | null {
  if (!timer || timer.finished) return null;
  const view = derive(timer, now);
  const event: TimerNotificationEvent | null =
    view.mode === 'running' ? 'completion' : view.mode === 'paused' ? 'pause_limit' : null;
  const at = event === 'completion' ? view.completionAt : view.pauseLimitAt;
  if (event === null || at === null || at <= now) return null;
  return {
    identifier: timerNotificationId(timer.id),
    userId,
    sessionId: timer.id,
    event,
    at,
    sound,
    ...TIMER_NOTIFICATION_COPY[event],
  };
}

export interface NotificationPermission {
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
}

/** The OS, as the timer needs it. Tests use a fake; the app uses `expo-timer-notifications`. */
export interface TimerNotificationAdapter {
  permission(): Promise<NotificationPermission>;
  requestPermission(): Promise<NotificationPermission>;
  /** The timer notifications pending with the OS (every user's), read back from what they carry. */
  scheduled(): Promise<TimerNotification[]>;
  schedule(notification: TimerNotification): Promise<void>;
  cancel(identifier: string): Promise<void>;
}

const same = (a: TimerNotification, b: TimerNotification) =>
  a.identifier === b.identifier &&
  a.userId === b.userId &&
  a.sessionId === b.sessionId &&
  a.event === b.event &&
  a.at === b.at &&
  a.sound === b.sound &&
  a.title === b.title &&
  a.body === b.body;

/**
 * Keeps the OS's timer notifications in line with the signed-in user's stored timer. It
 * follows the timer store (every stored transition), and `reconcile()` runs it again, for
 * example when the app returns to the foreground. Runs one at a time; a change during a run
 * starts one more run with the latest state, so the last state always wins. Only the current
 * user's notifications are touched. A failure is reported and repaired by a later run; it never
 * reaches the timer, which stays the only truth.
 */
export class TimerNotificationCoordinator {
  private sound = true;
  private asked = false;
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    private readonly options: {
      timers: ActiveTimerStore;
      adapter: TimerNotificationAdapter;
      report: (issue: { code: string }) => void;
    },
  ) {}

  /** Follows the timer store. Returns the unsubscribe. */
  start(): () => void {
    void this.reconcile();
    return this.options.timers.subscribe(() => void this.reconcile());
  }

  /** The user's sound preference for the completion signal (docs/11). */
  setSound(sound: boolean): Promise<void> {
    if (sound === this.sound) return this.idle();
    this.sound = sound;
    return this.reconcile();
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

  /** `reconcile` as a stable callback that returns nothing (for `onForeground`). */
  reconcileLater = (): void => void this.reconcile();

  /** Resolves once no run is pending. */
  idle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  private async reconcileOnce(): Promise<void> {
    const { timers, adapter, report } = this.options;
    const { status, userId, timer } = timers.getSnapshot();
    if (status !== 'ready' || userId === null) return;
    const wanted = planTimerNotification({ userId, timer, now: timers.now(), sound: this.sound });

    let pending: TimerNotification[];
    try {
      pending = (await adapter.scheduled()).filter((item) => item.userId === userId);
    } catch {
      report({ code: 'read_failed' });
      return;
    }
    for (const item of pending) {
      if (wanted && same(item, wanted)) continue;
      try {
        await adapter.cancel(item.identifier);
      } catch {
        report({ code: 'cancel_failed' });
      }
    }
    if (!wanted || pending.some((item) => same(item, wanted))) return;
    if (!(await this.allowed())) return;
    try {
      await adapter.schedule(wanted);
    } catch {
      report({ code: 'schedule_failed' });
    }
  }

  /**
   * Just in time (docs/02: ask in context): asked the first time a timer needs a notification,
   * at most once per launch, and only while the OS still may ask. Refused: the timer runs the
   * same, without notifications.
   */
  private async allowed(): Promise<boolean> {
    const { adapter, report } = this.options;
    try {
      let permission = await adapter.permission();
      if (permission.status === 'undetermined' && permission.canAskAgain && !this.asked) {
        this.asked = true;
        permission = await adapter.requestPermission();
      }
      return permission.status === 'granted';
    } catch {
      report({ code: 'permission_failed' });
      return false;
    }
  }
}
