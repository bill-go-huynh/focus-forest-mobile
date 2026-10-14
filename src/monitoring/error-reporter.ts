/**
 * M7.2 Crash and error reports for the server's self-built monitoring (A7.4; Phase 7 owner
 * decision 1: no third party). Reports carry what happened, the app version and platform, and the
 * screen; never who. They are sent only while the person shares usage data (CR.6), held in memory
 * until that is known, at most twenty, and tried again after a failed send.
 */

export interface ClientErrorReport {
  occurredAt: string;
  kind: 'crash' | 'error';
  platform: 'ios' | 'android';
  appVersion: string;
  screen: string | null;
  message: string;
  stack: string | null;
}

const MAX_HELD = 20;
const MESSAGE_MAX = 5000;
const STACK_MAX = 20_000;

export class ErrorReporter {
  private held: ClientErrorReport[] = [];
  /** Unknown until the preferences are read; off forgets everything held. */
  private sharing: boolean | undefined;
  private running: Promise<void> | null = null;

  constructor(
    private readonly options: {
      send: (reports: readonly ClientErrorReport[]) => Promise<void>;
      platform: 'ios' | 'android';
      appVersion: string;
      now: () => number;
    },
  ) {}

  report(error: {
    kind: 'crash' | 'error';
    message: string;
    stack: string | null;
    screen: string | null;
  }): void {
    if (this.sharing === false) return;
    this.held.push({
      occurredAt: new Date(this.options.now()).toISOString(),
      kind: error.kind,
      platform: this.options.platform,
      appVersion: this.options.appVersion,
      screen: error.screen,
      message: (error.message || '(no message)').slice(0, MESSAGE_MAX),
      stack: error.stack ? error.stack.slice(0, STACK_MAX) : null,
    });
    // The newest twenty.
    if (this.held.length > MAX_HELD) this.held = this.held.slice(-MAX_HELD);
    void this.flush();
  }

  /** The person's `shareUsageData`, once known; `undefined` while it is not. */
  setSharing(sharing: boolean | undefined): void {
    this.sharing = sharing;
    if (sharing === false) this.held = [];
    if (sharing) void this.flush();
  }

  /** Sends what is held, one batch at a time; a failure keeps it for the next try. */
  flush(): Promise<void> {
    // A run in progress also sends what arrives while it sends.
    if (this.running) return this.running;
    this.running = this.drain();
    return this.running;
  }

  private async drain(): Promise<void> {
    // Let `flush` record this run before it can end.
    await Promise.resolve();
    try {
      while (this.sharing && this.held.length > 0) {
        const batch = this.held.slice(0, MAX_HELD);
        await this.options.send(batch);
        this.held = this.held.slice(batch.length);
      }
    } catch {
      // Kept for the next try.
    } finally {
      this.running = null;
    }
  }

  /** Resolves when no send is in progress. */
  idle(): Promise<void> {
    return this.running ?? Promise.resolve();
  }
}
