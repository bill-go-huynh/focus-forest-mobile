import type { ActiveTimerStore } from './active-timer-store';
import { derive } from './timer-engine';

const defaultSchedule = (run: () => void, milliseconds: number): unknown =>
  setTimeout(run, milliseconds);
const defaultCancel = (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>);

/**
 * Wakes the app when the signed-in user's timer reaches its end while the app is open on any
 * screen: at C while it runs, just past L while it is paused (a pause ends only once it goes
 * past the limit). Waking only calls `timers.refresh()`: the store settles the end at the
 * instant the engine derives, however late the wake-up is, so this never keeps time. It follows
 * every stored change, waits only in the foreground (the OS notification covers the
 * background), and waits again if it woke too early.
 */
export class ForegroundWakeup {
  private handle: unknown = null;
  private active = true;
  private running: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly options: {
      timers: ActiveTimerStore;
      /** setTimeout by default; tests pass their own. */
      schedule?: (run: () => void, milliseconds: number) => unknown;
      cancel?: (handle: unknown) => void;
    },
  ) {}

  /** Follows the timer store. Returns the unsubscribe, which also stops waiting. */
  start(): () => void {
    this.arm();
    const unsubscribe = this.options.timers.subscribe(() => this.arm());
    return () => {
      unsubscribe();
      this.disarm();
    };
  }

  /** The app came to the foreground (true) or left it (false). */
  setActive(active: boolean): void {
    this.active = active;
    this.arm();
  }

  /** Resolves once the last wake-up's refresh has finished. */
  idle(): Promise<unknown> {
    return this.running;
  }

  private arm(): void {
    this.disarm();
    const { timers } = this.options;
    const { status, timer } = timers.getSnapshot();
    if (!this.active || status !== 'ready' || !timer || timer.finished) return;
    const now = timers.now();
    const view = derive(timer, now);
    const end =
      view.mode === 'running'
        ? view.completionAt
        : view.mode === 'paused' && view.pauseLimitAt !== null
          ? view.pauseLimitAt + 1
          : null;
    if (end === null) return;
    const schedule = this.options.schedule ?? defaultSchedule;
    this.handle = schedule(() => this.wake(), Math.max(0, end - now));
  }

  private wake(): void {
    this.handle = null;
    // Nothing stored changes when it woke early; then it waits again.
    this.running = this.options.timers.refresh().then(
      () => this.arm(),
      () => this.arm(),
    );
  }

  private disarm(): void {
    if (this.handle === null) return;
    (this.options.cancel ?? defaultCancel)(this.handle);
    this.handle = null;
  }
}
