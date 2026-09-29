import { memoryStorage } from '../../test-utils/storage';
import { ActiveTimerStore } from '../active-timer-store';
import { ForegroundWakeup } from '../foreground-wakeup';

const MINUTE = 60_000;
const T0 = Date.parse('2026-09-29T08:00:00.000Z');
const ADA = '11111111-1111-4111-8111-111111111111';
const TOPIC = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';
const RULES = { minValidMinutes: 5, maxPauseMinutes: 30 };

/** setTimeout in the test's hands: what is waiting, and for how long. */
function fakeScheduler() {
  let next = 1;
  const waiting = new Map<number, { fn: () => void; ms: number }>();
  return {
    schedule: (fn: () => void, ms: number) => {
      const id = next++;
      waiting.set(id, { fn, ms });
      return id;
    },
    cancel: (id: unknown) => void waiting.delete(id as number),
    waiting: () => [...waiting.values()].map((entry) => entry.ms),
    /** Runs what is waiting, as a (possibly late) timer would. */
    fire: () => {
      const entries = [...waiting.entries()];
      waiting.clear();
      for (const [, entry] of entries) entry.fn();
    },
  };
}

async function setup() {
  const clock = { now: T0 };
  const timers = new ActiveTimerStore({
    storage: memoryStorage(),
    now: () => clock.now,
    createId: () => '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
    report: () => undefined,
  });
  const scheduler = fakeScheduler();
  const wakeup = new ForegroundWakeup({
    timers,
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
  });
  const stop = wakeup.start();
  await timers.activate(ADA);
  return { clock, timers, scheduler, wakeup, stop };
}

const settled = async (app: Awaited<ReturnType<typeof setup>>) => {
  await app.wakeup.idle();
  return app.timers.getSnapshot().timer;
};

describe('ForegroundWakeup', () => {
  it('waits for C while the timer runs, then stores the end at exactly C, however late it wakes', async () => {
    const app = await setup();
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    expect(app.scheduler.waiting()).toEqual([25 * MINUTE]);

    app.clock.now = T0 + 25 * MINUTE + 4_000; // the JS timer ran 4 s late
    app.scheduler.fire();

    expect((await settled(app))?.finished).toEqual({ at: T0 + 25 * MINUTE, reason: 'completed' });
    expect(app.scheduler.waiting()).toEqual([]);
  });

  it('waits for L while paused, and stores the pause-limit end at exactly L', async () => {
    const app = await setup();
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    app.clock.now = T0 + 5 * MINUTE;
    await app.timers.pause();
    // The pause ends only once it goes past L: one millisecond after it.
    expect(app.scheduler.waiting()).toEqual([30 * MINUTE + 1]);

    app.clock.now = T0 + 40 * MINUTE;
    app.scheduler.fire();

    expect((await settled(app))?.finished).toEqual({
      at: T0 + 35 * MINUTE,
      reason: 'pause_limit',
    });
  });

  it('replaces the wait on every change: pause, resume, end', async () => {
    const app = await setup();
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    app.clock.now = T0 + 5 * MINUTE;
    await app.timers.pause();
    app.clock.now = T0 + 9 * MINUTE;
    await app.timers.resume();
    expect(app.scheduler.waiting()).toEqual([20 * MINUTE]);

    await app.timers.end();
    expect(app.scheduler.waiting()).toEqual([]);
  });

  it('waits again when it woke before the end (a clock that moved back)', async () => {
    const app = await setup();
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });

    app.clock.now = T0 + 10 * MINUTE;
    app.scheduler.fire();

    expect((await settled(app))?.finished).toBeNull();
    expect(app.scheduler.waiting()).toEqual([15 * MINUTE]);
  });

  it('waits only in the foreground, and picks up again on the return', async () => {
    const app = await setup();
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });

    app.wakeup.setActive(false);
    expect(app.scheduler.waiting()).toEqual([]);

    app.clock.now = T0 + 3 * MINUTE;
    app.wakeup.setActive(true);
    expect(app.scheduler.waiting()).toEqual([22 * MINUTE]);
  });

  it('stops waiting on sign-out and when stopped', async () => {
    const app = await setup();
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });

    app.timers.deactivate();
    expect(app.scheduler.waiting()).toEqual([]);

    await app.timers.activate(ADA);
    expect(app.scheduler.waiting()).toEqual([25 * MINUTE]);
    app.stop();
    expect(app.scheduler.waiting()).toEqual([]);
  });

  it('waits for nothing without a running or paused timer', async () => {
    const app = await setup();
    expect(app.scheduler.waiting()).toEqual([]);
  });
});
