import { memoryStorage } from '../../test-utils/storage';
import { ActiveTimerStore } from '../../timer/active-timer-store';
import { FocusLeaseCoordinator, planFocusLease, type FocusLeaseApi } from '../focus-lease';

/**
 * M6.1 The focus lease (A6.1, docs/02: nothing during an active focus session). While a timer
 * runs or is paused, the server holds every notification until the lease ends; the app keeps
 * the lease at the latest instant the focus could still be going, and drops it when focus ends.
 */

const MINUTE = 60_000;
const T0 = Date.parse('2026-10-13T08:00:00.000Z');
const ADA = '11111111-1111-4111-8111-111111111111';
const TOPIC = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';
const RULES = { minValidMinutes: 5, maxPauseMinutes: 30 };

function setup() {
  const clock = { now: T0 };
  let ids = 0;
  const timers = new ActiveTimerStore({
    storage: memoryStorage(),
    now: () => clock.now,
    createId: () => `0192f1a2-3b4c-7d5e-8f60-71829300000${++ids}`,
    report: () => undefined,
  });
  const calls: string[] = [];
  const state = { fail: false };
  const api: FocusLeaseApi = {
    set: jest.fn(async (endsAt: string) => {
      calls.push(`set ${endsAt}`);
      if (state.fail) throw new Error('offline');
    }),
    clear: jest.fn(async () => {
      calls.push('clear');
      if (state.fail) throw new Error('offline');
    }),
  };
  const report = jest.fn();
  const lease = new FocusLeaseCoordinator({ timers, api, now: () => clock.now, report });
  const stop = lease.start();
  return { clock, timers, api, calls, state, lease, report, stop };
}

describe('planFocusLease (M6.1)', () => {
  const started = {
    version: 1 as const,
    id: '0192f1a2-3b4c-7d5e-8f60-718293000001',
    topicId: TOPIC,
    plannedMinutes: 25,
    rules: RULES,
    startedAt: T0,
    pauses: [],
    pausedAt: null,
    finished: null,
  };

  it('ends a running focus at its completion', () => {
    expect(planFocusLease(started, T0 + 5 * MINUTE)).toBe(T0 + 25 * MINUTE);
  });

  it('covers a pause up to its limit, plus the focus still to come', () => {
    // Paused after 10 minutes: the pause may last 30, then 15 minutes of focus remain.
    const paused = { ...started, pausedAt: T0 + 10 * MINUTE };
    expect(planFocusLease(paused, T0 + 12 * MINUTE)).toBe(T0 + (10 + 30 + 15) * MINUTE);
  });

  it('never asks the server for more than a day ahead, which it refuses', () => {
    const day = { ...started, plannedMinutes: 1440 };
    expect(planFocusLease(day, T0)).toBe(T0 + 1439 * MINUTE);
  });

  it('holds nothing without a timer, or once it has ended', () => {
    expect(planFocusLease(null, T0)).toBeNull();
    expect(
      planFocusLease({ ...started, finished: { at: T0 + MINUTE, reason: 'ended' } }, T0 + MINUTE),
    ).toBeNull();
    // Past its completion the timer is about to settle as completed: nothing to hold.
    expect(planFocusLease(started, T0 + 26 * MINUTE)).toBeNull();
  });
});

describe('FocusLeaseCoordinator (M6.1)', () => {
  it('sets the lease when focus starts, moves it after a pause, and drops it at the end', async () => {
    const app = setup();
    await app.timers.activate(ADA);
    await app.lease.idle();
    expect(app.calls).toEqual([]);

    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    await app.lease.idle();
    expect(app.calls).toEqual(['set 2026-10-13T08:25:00.000Z']);

    app.clock.now = T0 + 10 * MINUTE;
    await app.timers.pause();
    await app.lease.idle();
    expect(app.calls.at(-1)).toBe('set 2026-10-13T08:55:00.000Z');

    app.clock.now = T0 + 20 * MINUTE;
    await app.timers.resume();
    await app.lease.idle();
    // Resumed after a 10-minute pause: 15 minutes of focus remain.
    expect(app.calls.at(-1)).toBe('set 2026-10-13T08:35:00.000Z');

    app.clock.now = T0 + 22 * MINUTE;
    await app.timers.end();
    await app.lease.idle();
    expect(app.calls.at(-1)).toBe('clear');
    expect(app.calls).toHaveLength(4);
  });

  it('sends nothing again while the lease is unchanged', async () => {
    const app = setup();
    await app.timers.activate(ADA);
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    await app.lease.idle();
    await app.lease.reconcile();
    await app.lease.reconcile();
    expect(app.calls).toEqual(['set 2026-10-13T08:25:00.000Z']);
  });

  it('reports a failure and tries again on the next run', async () => {
    const app = setup();
    await app.timers.activate(ADA);
    app.state.fail = true;
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    await app.lease.idle();
    expect(app.report).toHaveBeenCalledWith({ code: 'lease_failed' });

    app.state.fail = false;
    await app.lease.reconcile();
    expect(app.calls).toEqual(['set 2026-10-13T08:25:00.000Z', 'set 2026-10-13T08:25:00.000Z']);
  });

  it('forgets the lease on sign-out without calling the server', async () => {
    const app = setup();
    await app.timers.activate(ADA);
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    await app.lease.idle();
    app.timers.deactivate();
    await app.lease.idle();
    expect(app.calls).toEqual(['set 2026-10-13T08:25:00.000Z']);

    // Signing in again sets it again: the server may have dropped it.
    await app.timers.activate(ADA);
    await app.lease.idle();
    expect(app.calls).toEqual(['set 2026-10-13T08:25:00.000Z', 'set 2026-10-13T08:25:00.000Z']);
  });

  it('knows whether someone is focusing, for the foreground', async () => {
    const app = setup();
    await app.timers.activate(ADA);
    expect(app.lease.focusing()).toBe(false);
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    expect(app.lease.focusing()).toBe(true);
    await app.timers.end();
    expect(app.lease.focusing()).toBe(false);
  });
});
