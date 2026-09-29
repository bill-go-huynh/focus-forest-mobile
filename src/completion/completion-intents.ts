import type { ActiveTimerSnapshot, ActiveTimerStore } from '../timer/active-timer-store';

/**
 * `foreground`: a session that ended while this app had it running. `tap`: the user tapped
 * its notification (the data is a navigation hint; what the screen shows comes from the session).
 */
export interface CompletionIntent {
  userId: string;
  sessionId: string;
  source: 'foreground' | 'tap';
}

export interface CompletionIntentsSnapshot {
  pending: CompletionIntent | null;
}

/**
 * Which Session Completion to open next, in memory. A session is shown at most once per launch,
 * however many times it is asked for (a notification tapped twice, a response replayed). The
 * navigator decides when it opens, and for whom.
 */
export class CompletionIntents {
  private snapshot: CompletionIntentsSnapshot = { pending: null };
  private listeners = new Set<() => void>();
  private readonly done = new Set<string>();

  getSnapshot = (): CompletionIntentsSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  request(intent: CompletionIntent): void {
    if (this.done.has(intent.sessionId)) return;
    if (this.snapshot.pending?.sessionId === intent.sessionId) return;
    this.set({ pending: intent });
  }

  /** It was opened: never again in this launch. */
  shown(sessionId: string): void {
    this.done.add(sessionId);
    if (this.snapshot.pending?.sessionId === sessionId) this.set({ pending: null });
  }

  /** Not for this user, or not to be opened: forget it (a later tap may ask again). */
  drop(sessionId: string): void {
    if (this.snapshot.pending?.sessionId === sessionId) this.set({ pending: null });
  }

  /**
   * Asks for a session's completion when a timer this launch saw running or paused is handed
   * off (the store clears a finished timer only once its session is in the outbox). A timer
   * that was already finished at launch, or that left with a sign-out, is not asked for.
   */
  watch(timers: ActiveTimerStore): () => void {
    const seen = new Set<string>();
    let previous: ActiveTimerSnapshot = timers.getSnapshot();
    const observe = () => {
      const current = timers.getSnapshot();
      if (current.timer && !current.timer.finished) seen.add(current.timer.id);
      const gone = previous.timer;
      if (
        gone &&
        seen.has(gone.id) &&
        previous.status === 'ready' &&
        current.status === 'ready' &&
        current.userId === previous.userId &&
        current.userId !== null &&
        current.timer?.id !== gone.id
      ) {
        seen.delete(gone.id);
        this.request({ userId: current.userId, sessionId: gone.id, source: 'foreground' });
      }
      previous = current;
    };
    observe();
    return timers.subscribe(observe);
  }

  private set(snapshot: CompletionIntentsSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
