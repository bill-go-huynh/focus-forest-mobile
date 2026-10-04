import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import {
  readStoredJson,
  type KeyValueStorage,
  type ParsedValue,
  type StorageIssue,
} from '../common/stored-json';

/** One key per user: a user never sees another's onboarding, and sign-out keeps it. */
export const onboardingKey = (userId: string) => `focus-forest/onboarding/v1/${userId}`;

export const ONBOARDING_STEPS = ['concept', 'goal', 'first-session'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** A new account's onboarding: still to finish (at a step), or done for good. */
export type Onboarding = { status: 'pending'; step: OnboardingStep } | { status: 'complete' };

export interface OnboardingSnapshot {
  status: 'inactive' | 'restoring' | 'ready' | 'unavailable';
  userId: string | null;
  /** Null when there is no record: an account from before onboarding, which goes straight in. */
  onboarding: Onboarding | null;
}

const documentSchema = z.discriminatedUnion('status', [
  z.strictObject({
    version: z.literal(1),
    status: z.literal('pending'),
    step: z.enum(ONBOARDING_STEPS),
  }),
  z.strictObject({ version: z.literal(1), status: z.literal('complete') }),
]);

function parseDocument(value: unknown): ParsedValue<Onboarding> {
  const version = (value as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version !== 1) {
    return { ok: false, reason: 'unsupported_version' };
  }
  const parsed = documentSchema.safeParse(value);
  if (!parsed.success) return { ok: false, reason: 'invalid_state' };
  return {
    ok: true,
    value:
      parsed.data.status === 'pending'
        ? { status: 'pending', step: parsed.data.step }
        : { status: 'complete' },
  };
}

const INACTIVE: OnboardingSnapshot = { status: 'inactive', userId: null, onboarding: null };

/**
 * Whether a user still has onboarding to go through (M3.3), per user, durable across kills. Only
 * sign-up marks an account pending (`markPending`, right after the account is created), so an
 * account with no record (one from before onboarding, or signed in on this device) is never sent
 * through it. The step is kept so a restart resumes where the user was; `complete` is final. A
 * corrupt entry is moved aside and the user goes into the app (the migration-safe fallback).
 * Reads and writes run one at a time.
 */
export class OnboardingStore {
  private snapshot: OnboardingSnapshot = INACTIVE;
  private listeners = new Set<() => void>();
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly options: { storage: KeyValueStorage; report: (issue: StorageIssue) => void },
  ) {}

  getSnapshot = (): OnboardingSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  activate(userId: string): Promise<OnboardingSnapshot> {
    const generation = ++this.generation;
    this.set({ status: 'restoring', userId, onboarding: null });
    const read = this.queue.then(async () => {
      if (generation !== this.generation) return this.snapshot;
      const { storage, report } = this.options;
      const stored = await readStoredJson(storage, onboardingKey(userId), parseDocument, report);
      if (generation !== this.generation) return this.snapshot;
      this.set({
        status: stored.kind === 'unavailable' ? 'unavailable' : 'ready',
        userId,
        onboarding: stored.kind === 'ok' ? stored.value : null,
      });
      return this.snapshot;
    });
    this.queue = read.catch(() => undefined);
    return read;
  }

  /** Forgets it in memory (sign-out). Storage keeps it for the user's next sign-in. */
  deactivate(): void {
    this.generation += 1;
    this.set(INACTIVE);
  }

  /**
   * Marks a just-created account pending, at the first step. Written whether or not the user is
   * active yet (sign-up calls it as soon as the account exists). False when it could not be
   * stored; the active user still goes through onboarding in this launch.
   */
  markPending(userId: string): Promise<boolean> {
    return this.write(userId, { status: 'pending', step: 'concept' }, { always: true });
  }

  /** The step the user reached; ignored once onboarding is complete. */
  reachStep(userId: string, step: OnboardingStep): Promise<boolean> {
    return this.write(userId, { status: 'pending', step });
  }

  /** Onboarding is done for good: it never opens again for this user. */
  complete(userId: string): Promise<boolean> {
    return this.write(userId, { status: 'complete' });
  }

  private write(
    userId: string,
    next: Onboarding,
    { always = false }: { always?: boolean } = {},
  ): Promise<boolean> {
    const write = this.queue.then(async () => {
      const { status, userId: owner, onboarding } = this.snapshot;
      const active = owner === userId && status === 'ready';
      // A step or completion is for the active user's own pending onboarding only.
      if (!always && (!active || onboarding?.status !== 'pending')) return false;
      if (always && owner === userId && status === 'unavailable') return false;
      const show = () => {
        if (this.snapshot.userId === userId && this.snapshot.status === 'ready') {
          this.set({ ...this.snapshot, onboarding: next });
        }
      };
      const document =
        next.status === 'pending'
          ? { version: 1, status: 'pending', step: next.step }
          : { version: 1, status: 'complete' };
      try {
        await this.options.storage.setItem(onboardingKey(userId), JSON.stringify(document));
      } catch {
        this.options.report({ code: 'write_failed' });
        // A new account still gets its onboarding in this launch.
        if (always) show();
        return false;
      }
      show();
      return true;
    });
    this.queue = write.catch(() => undefined);
    return write;
  }

  private set(snapshot: OnboardingSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

/** The app's onboarding store, on AsyncStorage. Issues are reported by code only. */
export function createAppOnboardingStore(): OnboardingStore {
  return new OnboardingStore({
    storage: AsyncStorage,
    report: (issue) => console.warn(`[onboarding] onboarding state: ${issue.code}`),
  });
}
