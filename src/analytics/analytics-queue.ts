import { HttpError } from '../api/errors';
import type { KeyValueStorage } from '../common/stored-json';

/**
 * Product analytics on the device (CR.6; docs/08 §6: privacy-respecting, to measure return
 * behavior for the Core Loop Checkpoint). A small queue per user, kept across kills and sent in
 * batches to POST /me/analytics/events. No free text ever: the event names and their whole-number
 * props are a closed list, the same as the API's. Nothing is recorded while signed out, nothing
 * is sent until the user's `shareUsageData` is known to be on, and turning it off forgets the
 * queue. Analytics never decide anything in the app.
 */

export const ANALYTICS_EVENTS = {
  app_opened: [],
  app_foregrounded: [],
  focus_started: ['plannedMinutes'],
  tree_details_opened: [],
  forest_opened: [],
  recap_opened: ['year', 'month'],
  insights_opened: [],
} as const satisfies Record<string, readonly string[]>;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;
export type AnalyticsProps = Partial<Record<string, number>>;

export interface QueuedEvent {
  id: string;
  name: AnalyticsEventName;
  occurredAt: string;
  localDate: string;
  platform: string;
  appVersion: string;
  props: Record<string, number>;
}

/** Technical bounds, not Product configuration. */
export const QUEUE_MAX = 500;
export const BATCH_MAX = 50;
/** A return to the app counts once per this long. */
export const FOREGROUND_GAP_MS = 30 * 60_000;

export const analyticsKey = (userId: string) => `focus-forest/analytics/v1/${userId}`;

/** Events a screen recorded at launch before the user was known (a screen's effect runs first). */
const EARLY_MAX = 20;

export interface AnalyticsQueueOptions {
  storage: KeyValueStorage;
  send: (events: QueuedEvent[]) => Promise<unknown>;
  now: () => Date;
  newId: () => string;
  platform: string;
  appVersion: string;
  /** The device's local calendar date of an instant (YYYY-MM-DD). */
  localDateOf: (date: Date) => string;
}

export class AnalyticsQueue {
  private userId: string | null = null;
  /** Until the first sign-in is known: early events wait here; after a sign-out, none do. */
  private signedOut = false;
  private early: { name: AnalyticsEventName; props: AnalyticsProps; at: Date }[] = [];
  private events: QueuedEvent[] = [];
  /** Null while the user's preference is not known yet: events wait, nothing is sent. */
  private sharing: boolean | null = null;
  private sending = false;
  private lastForeground = Number.NEGATIVE_INFINITY;
  private writes: Promise<void> = Promise.resolve();
  /** While the user's stored queue is read: records wait for it, so nothing overwrites it. */
  private loading: Promise<void> | null = null;
  private activation: Promise<void> | null = null;

  constructor(private readonly options: AnalyticsQueueOptions) {}

  size(): number {
    return this.events.length;
  }

  peek(): readonly QueuedEvent[] {
    return this.events;
  }

  /**
   * The signed-in user: their queue is read back from the device, then events a screen recorded
   * before the user was known are added. Calling it again for the same user waits for the same
   * activation.
   */
  activate(userId: string): Promise<void> {
    if (this.userId === userId && this.activation) return this.activation;
    this.userId = userId;
    this.sharing = null;
    this.events = [];
    this.activation = (async () => {
      this.loading = this.load(userId);
      await this.loading;
      this.loading = null;
      this.signedOut = false;
      const early = this.early;
      this.early = [];
      for (const event of early) await this.record(event.name, event.props, event.at);
    })();
    return this.activation;
  }

  private async load(userId: string): Promise<void> {
    try {
      const raw = await this.options.storage.getItem(analyticsKey(userId));
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (this.userId === userId && Array.isArray(parsed)) {
        this.events = parsed.filter(isQueuedEvent).slice(-QUEUE_MAX);
      }
    } catch {
      // An unreadable queue is only lost analytics: start empty.
    }
  }

  /** Sign-out: the user's events are forgotten on this device. */
  async signOut(): Promise<void> {
    const userId = this.userId;
    this.userId = null;
    this.activation = null;
    this.signedOut = true;
    this.early = [];
    this.events = [];
    this.sharing = null;
    if (userId) await this.persist(userId, null);
  }

  /** The user's `shareUsageData`. Off forgets everything queued. */
  setSharing(enabled: boolean): void {
    this.sharing = enabled;
    if (!enabled && this.userId) {
      this.events = [];
      void this.persist(this.userId, null);
    }
  }

  async record(
    name: AnalyticsEventName,
    props: AnalyticsProps = {},
    at: Date = this.options.now(),
  ): Promise<void> {
    if (this.loading) await this.loading;
    const userId = this.userId;
    if (!userId) {
      if (!this.signedOut && this.early.length < EARLY_MAX) this.early.push({ name, props, at });
      return;
    }
    if (this.sharing === false) return;
    const now = at;
    const kept: Record<string, number> = {};
    for (const key of ANALYTICS_EVENTS[name] as readonly string[]) {
      const value = props[key];
      if (typeof value === 'number' && Number.isInteger(value)) kept[key] = value;
    }
    let id: string;
    try {
      id = this.options.newId();
    } catch {
      // Analytics never fail the app: an event without an id is not recorded.
      return;
    }
    this.events = [
      ...this.events,
      {
        id,
        name,
        occurredAt: now.toISOString(),
        localDate: this.options.localDateOf(now),
        platform: this.options.platform,
        appVersion: this.options.appVersion,
        props: kept,
      },
    ].slice(-QUEUE_MAX);
    await this.persist(userId, this.events);
  }

  /** The app came back to the foreground: counted at most once per `FOREGROUND_GAP_MS`. */
  async foregrounded(): Promise<void> {
    const now = this.options.now().getTime();
    if (now - this.lastForeground < FOREGROUND_GAP_MS) return;
    this.lastForeground = now;
    await this.record('app_foregrounded');
  }

  /**
   * Sends what is queued, oldest first, in batches. A batch the server took is removed; one it
   * refuses as malformed (4xx other than 401) is dropped so it never blocks the rest; on a
   * network failure, a 401, or a server error everything stays for the next try.
   */
  async flush(): Promise<void> {
    const userId = this.userId;
    if (!userId || this.sharing !== true || this.sending) return;
    this.sending = true;
    try {
      while (this.userId === userId && this.sharing === true && this.events.length > 0) {
        const batch = this.events.slice(0, BATCH_MAX);
        try {
          await this.options.send(batch);
        } catch (error) {
          const malformed =
            error instanceof HttpError &&
            error.status >= 400 &&
            error.status < 500 &&
            error.status !== 401;
          if (!malformed) return;
        }
        const sent = new Set(batch.map((event) => event.id));
        this.events = this.events.filter((event) => !sent.has(event.id));
        await this.persist(userId, this.events);
      }
    } finally {
      this.sending = false;
    }
  }

  private persist(userId: string, events: QueuedEvent[] | null): Promise<void> {
    const { storage } = this.options;
    this.writes = this.writes.then(async () => {
      try {
        if (events && events.length > 0) {
          await storage.setItem(analyticsKey(userId), JSON.stringify(events));
        } else {
          await storage.removeItem(analyticsKey(userId));
        }
      } catch {
        // Analytics never fail the app.
      }
    });
    return this.writes;
  }
}

function isQueuedEvent(value: unknown): value is QueuedEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event['id'] === 'string' &&
    typeof event['name'] === 'string' &&
    event['name'] in ANALYTICS_EVENTS &&
    typeof event['occurredAt'] === 'string' &&
    typeof event['localDate'] === 'string' &&
    typeof event['props'] === 'object'
  );
}
