import type { ActiveTimerStore } from '../timer/active-timer-store';
import { derive, type TimerState } from '../timer/timer-engine';

/**
 * The ongoing notification while a session runs (owner, 2026-10-22): a live countdown in the
 * notification shade, from the local module `modules/focus-ongoing-notification` (Android).
 * Android counts down to the end by itself with the notification's chronometer, so the
 * countdown stays live in the background, with the screen locked, or with the app killed, and
 * removes the notification at the end. Like the completion notification, it owns nothing: it is
 * planned again from the stored timer at every change, and the timer stays the only truth.
 */

export interface OngoingFocusNotice {
  title: string;
  body: string;
  /** Epoch ms the countdown runs to, or 0 while paused (no countdown). */
  countdownTo: number;
  /** Epoch ms after which Android removes it by itself: the end, or the end of the pause. */
  timeoutAt: number;
  /** Where a tap opens: the Focus screen. */
  url: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "17:30", or "1:20:00" from an hour. */
function remainingText(milliseconds: number): string {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** The notice a timer needs at `now`: a countdown while running, what is left while paused. */
export function planOngoingFocus({
  timer,
  now,
  url,
}: {
  timer: TimerState | null;
  now: number;
  url: string;
}): OngoingFocusNotice | null {
  if (!timer || timer.finished) return null;
  const view = derive(timer, now);
  if (view.mode === 'running' && view.completionAt !== null && view.completionAt > now) {
    return {
      title: 'Focusing',
      body: 'Your tree is growing. Tap to return.',
      countdownTo: view.completionAt,
      timeoutAt: view.completionAt,
      url,
    };
  }
  if (view.mode === 'paused' && view.pauseLimitAt !== null && view.pauseLimitAt > now) {
    return {
      title: 'Paused',
      body: `${remainingText(view.remainingMilliseconds)} left. Resume when you're ready.`,
      countdownTo: 0,
      timeoutAt: view.pauseLimitAt,
      url,
    };
  }
  return null;
}

/** The shade, as the timer needs it. Tests use a fake; the app uses the native module. */
export interface OngoingFocusAdapter {
  show(notice: OngoingFocusNotice): void;
  hide(): void;
}

/** The native module's functions (`FocusOngoingNotificationModule.kt`), in its argument order. */
export interface OngoingFocusNative {
  show(title: string, body: string, countdownTo: number, timeoutAt: number, url: string): void;
  hide(): void;
}

/**
 * The shade through the native module, loaded on first use. Where the module is missing (Expo
 * Go, iOS, a build made before it existed) nothing is shown, and the timer works the same.
 */
export function createOngoingFocusAdapter(
  load: () => OngoingFocusNative | null,
): OngoingFocusAdapter {
  let native: OngoingFocusNative | null | undefined;
  const module = () => (native === undefined ? (native = load()) : native);
  return {
    show: (notice) =>
      module()?.show(notice.title, notice.body, notice.countdownTo, notice.timeoutAt, notice.url),
    hide: () => module()?.hide(),
  };
}

const same = (a: OngoingFocusNotice | null, b: OngoingFocusNotice | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.title === b.title &&
    a.body === b.body &&
    a.countdownTo === b.countdownTo &&
    a.timeoutAt === b.timeoutAt &&
    a.url === b.url);

/**
 * Keeps the shade in line with the signed-in user's stored timer: shown while a session runs or
 * is paused, updated on pause and resume, hidden when it ends or on sign-out. `refresh()` posts
 * it again (back in the foreground: Android 14 lets people swipe it away). A failure is
 * reported and repaired by a later run; it never reaches the timer.
 */
export class OngoingFocusNotification {
  private shown: OngoingFocusNotice | null = null;

  constructor(
    private readonly options: {
      timers: ActiveTimerStore;
      adapter: OngoingFocusAdapter;
      url: string;
      report: (issue: { code: string }) => void;
    },
  ) {}

  /** Follows the timer store. Returns the unsubscribe. */
  start(): () => void {
    this.reconcile();
    return this.options.timers.subscribe(() => this.reconcile());
  }

  /** Brings the shade in line, posting only what changed. */
  reconcile(): void {
    this.apply(false);
  }

  /** Brings the shade in line, posting the notice again even when unchanged. */
  refresh = (): void => {
    this.apply(true);
  };

  private apply(force: boolean): void {
    const { timers, adapter, url, report } = this.options;
    const { status, userId, timer } = timers.getSnapshot();
    const wanted =
      status === 'ready' && userId !== null
        ? planOngoingFocus({ timer, now: timers.now(), url })
        : null;
    if (!force && same(wanted, this.shown)) return;
    if (wanted === null) {
      try {
        adapter.hide();
        this.shown = null;
      } catch {
        report({ code: 'hide_failed' });
      }
      return;
    }
    try {
      adapter.show(wanted);
      this.shown = wanted;
    } catch {
      this.shown = null;
      report({ code: 'show_failed' });
    }
  }
}
