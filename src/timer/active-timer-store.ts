import { readStoredJson, type KeyValueStorage, type StorageIssue } from '../common/stored-json';
import {
  end,
  pause,
  resume,
  settle,
  start,
  type ActionError,
  type SessionRules,
  type StartError,
  type TimerResult,
  type TimerState,
} from './timer-engine';
import { parseTimerState } from './timer-state-schema';

export type { KeyValueStorage } from '../common/stored-json';
/** A technical problem worth reporting. Never carries the stored value (it can hold notes later). */
export type TimerStorageIssue = StorageIssue;

/**
 * `inactive`: nobody is signed in. `restoring`: reading the user's timer. `ready`: the timer
 * (or none) is known. `unavailable`: storage could not be read; nothing may start, so a timer
 * that is there but unreadable is never overwritten.
 */
export type ActiveTimerStatus = 'inactive' | 'restoring' | 'ready' | 'unavailable';

export interface ActiveTimerSnapshot {
  status: ActiveTimerStatus;
  userId: string | null;
  timer: TimerState | null;
}

export type TimerOperationError =
  StartError | ActionError | 'not_ready' | 'timer_exists' | 'no_timer' | 'storage_failed';

/** `timer` is always what is stored: a failed write leaves the previous state. */
export type TimerOperationResult =
  | { ok: true; timer: TimerState }
  | { ok: false; reason: TimerOperationError; timer: TimerState | null };

export interface ActiveTimerStoreOptions {
  storage: KeyValueStorage;
  now: () => number;
  createId: () => string;
  report: (issue: TimerStorageIssue) => void;
}

/** One key per user: a user never sees another's timer, and sign-out keeps it. */
export const activeTimerKey = (userId: string) => `focus-forest/active-timer/v1/${userId}`;

const INACTIVE: ActiveTimerSnapshot = { status: 'inactive', userId: null, timer: null };

/**
 * The signed-in user's one active (or finished, not yet handed off) timer, persisted on every
 * transition. Memory changes only after the write succeeds, so what the app shows is always
 * what a restart would restore. Operations run one at a time, in call order. Observable for
 * React (useSyncExternalStore), like SessionStore.
 */
export class ActiveTimerStore {
  private snapshot: ActiveTimerSnapshot = INACTIVE;
  private listeners = new Set<() => void>();
  // Bumped on every activate and deactivate, so work for a previous user never lands.
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: ActiveTimerStoreOptions) {}

  getSnapshot = (): ActiveTimerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Restores the user's timer: read, validate, settle at `now`, and store a settled end
   * before showing it. Corrupt entries are moved aside, reported, and treated as no timer.
   */
  activate(userId: string): Promise<ActiveTimerSnapshot> {
    const generation = ++this.generation;
    this.set({ status: 'restoring', userId, timer: null });
    return this.enqueue(async () => {
      if (generation === this.generation) {
        const restored = await this.restore(userId);
        if (generation === this.generation) this.set(restored);
      }
      return this.snapshot;
    });
  }

  /** Forgets the timer in memory (sign-out). Storage keeps it for the user's next sign-in. */
  deactivate(): void {
    this.generation += 1;
    this.set(INACTIVE);
  }

  /** Starts a timer with a new client id. Refused while another timer exists. */
  start(input: {
    topicId: string;
    plannedMinutes: number;
    rules: SessionRules;
  }): Promise<TimerOperationResult> {
    return this.operate(async (current, commit) => {
      if (current) return { ok: false, reason: 'timer_exists', timer: current };
      let id: string;
      try {
        id = this.options.createId();
      } catch {
        return { ok: false, reason: 'invalid_id', timer: null };
      }
      const begun = start({ ...input, id, now: this.options.now() });
      if (!begun.ok) return { ok: false, reason: begun.reason, timer: null };
      return commit(begun.state);
    });
  }

  pause(): Promise<TimerOperationResult> {
    return this.transition(pause);
  }

  resume(): Promise<TimerOperationResult> {
    return this.transition(resume);
  }

  end(): Promise<TimerOperationResult> {
    return this.transition(end);
  }

  /** Settles at `now` (for example when the app returns to the foreground). */
  refresh(): Promise<TimerOperationResult> {
    return this.operate(async (current, commit) => {
      if (!current) return { ok: false, reason: 'no_timer', timer: null };
      const settled = settle(current, this.options.now());
      return settled === current ? { ok: true, timer: current } : commit(settled);
    });
  }

  private transition(
    action: (state: TimerState, now: number) => TimerResult,
  ): Promise<TimerOperationResult> {
    return this.operate(async (current, commit) => {
      if (!current) return { ok: false, reason: 'no_timer', timer: null };
      const result = action(current, this.options.now());
      if (result.ok)
        return result.state === current ? { ok: true, timer: current } : commit(result.state);
      // A refusal because the session had already finished still records that end.
      const stored = result.state === current ? current : (await commit(result.state)).timer;
      return { ok: false, reason: result.reason, timer: stored };
    });
  }

  private operate(
    run: (
      current: TimerState | null,
      commit: (next: TimerState) => Promise<TimerOperationResult>,
    ) => Promise<TimerOperationResult>,
  ): Promise<TimerOperationResult> {
    return this.enqueue(async () => {
      const { status, userId, timer } = this.snapshot;
      if (status !== 'ready' || userId === null) {
        return { ok: false, reason: 'not_ready', timer: null } as const;
      }
      const generation = this.generation;
      return run(timer, async (next) => {
        if (!(await this.write(userId, next))) {
          return { ok: false, reason: 'storage_failed', timer };
        }
        if (generation === this.generation) this.set({ status, userId, timer: next });
        return { ok: true, timer: next };
      });
    });
  }

  private async restore(userId: string): Promise<ActiveTimerSnapshot> {
    const { storage, report, now } = this.options;
    const read = await readStoredJson(storage, activeTimerKey(userId), parseStored, report);
    if (read.kind === 'unavailable') return { status: 'unavailable', userId, timer: null };
    if (read.kind !== 'ok') return { status: 'ready', userId, timer: null };

    const settled = settle(read.value, now());
    // If the settled end cannot be stored, the stored state still derives the same end.
    const timer =
      settled !== read.value && (await this.write(userId, settled)) ? settled : read.value;
    return { status: 'ready', userId, timer };
  }

  private async write(userId: string, state: TimerState): Promise<boolean> {
    try {
      await this.options.storage.setItem(activeTimerKey(userId), JSON.stringify(state));
      return true;
    } catch {
      this.options.report({ code: 'write_failed' });
      return false;
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private set(snapshot: ActiveTimerSnapshot): void {
    const { status, userId, timer } = this.snapshot;
    if (status === snapshot.status && userId === snapshot.userId && timer === snapshot.timer)
      return;
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

function parseStored(value: unknown) {
  const parsed = parseTimerState(value);
  return parsed.ok ? { ok: true as const, value: parsed.state } : parsed;
}
