import { assertCalmCopy } from '../../components/calm-copy';
import { memoryStorage } from '../../test-utils/storage';
import { ActiveTimerStore } from '../../timer/active-timer-store';
import {
  planTimerNotification,
  TIMER_NOTIFICATION_COPY,
  TimerNotificationCoordinator,
  timerNotificationId,
  type NotificationPermission,
  type TimerNotification,
  type TimerNotificationAdapter,
} from '../timer-notifications';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const T0 = Date.parse('2026-09-29T08:00:00.000Z');
const ADA = '11111111-1111-4111-8111-111111111111';
const BEA = '22222222-2222-4222-8222-222222222222';
const TOPIC = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';
const RULES = { minValidMinutes: 5, maxPauseMinutes: 30 };

/** The OS side, in memory: pending notifications by identifier, and the permission. */
function fakeOs(initial: NotificationPermission = { status: 'granted', canAskAgain: true }) {
  const pending = new Map<string, TimerNotification>();
  const state = {
    permission: initial,
    /** What the OS answers the request with. */
    answer: { status: 'granted', canAskAgain: false } as NotificationPermission,
    requests: 0,
    failSchedule: false,
    failCancel: false,
    /** Holds each schedule until released, to race it. */
    holdSchedule: null as Promise<void> | null,
  };
  const adapter: TimerNotificationAdapter = {
    permission: async () => state.permission,
    requestPermission: async () => {
      state.requests += 1;
      state.permission = state.answer;
      return state.permission;
    },
    scheduled: async () => [...pending.values()],
    schedule: jest.fn(async (notification: TimerNotification) => {
      if (state.holdSchedule) await state.holdSchedule;
      if (state.failSchedule) throw new Error('os refused');
      pending.set(notification.identifier, notification);
    }),
    cancel: jest.fn(async (identifier: string) => {
      if (state.failCancel) throw new Error('os refused');
      pending.delete(identifier);
    }),
  };
  return { adapter, pending, state };
}

function setup(os = fakeOs(), storage = memoryStorage()) {
  const clock = { now: T0 };
  let ids = 0;
  const timers = new ActiveTimerStore({
    storage,
    now: () => clock.now,
    createId: () => `0192f1a2-3b4c-7d5e-8f60-71829300000${++ids}`,
    report: () => undefined,
  });
  const report = jest.fn();
  const coordinator = new TimerNotificationCoordinator({ timers, adapter: os.adapter, report });
  const stop = coordinator.start();
  return { os, storage, clock, timers, coordinator, report, stop };
}

type App = ReturnType<typeof setup>;

async function signIn(app: App, userId = ADA) {
  await app.timers.activate(userId);
  await app.coordinator.idle();
}
async function startTimer(app: App, plannedMinutes = 25) {
  const started = await app.timers.start({ topicId: TOPIC, plannedMinutes, rules: RULES });
  await app.coordinator.idle();
  return started;
}
const pendingList = (app: App) => [...app.os.pending.values()];
const only = (app: App) => {
  const list = pendingList(app);
  expect(list).toHaveLength(1);
  return list[0]!;
};

describe('planTimerNotification', () => {
  it('is nothing without a timer, or for one that has ended', () => {
    expect(planTimerNotification({ userId: ADA, timer: null, now: T0, sound: true })).toBeNull();
  });

  it('keeps the copy calm, and completion distinct from a pause that ran out', () => {
    const { completion, pause_limit } = TIMER_NOTIFICATION_COPY;
    expect(completion).toEqual({ title: 'Focus complete', body: 'Your focus session is ready.' });
    expect(pause_limit).toEqual({
      title: 'Focus session ended',
      body: 'Your paused session has been saved.',
    });
    for (const text of [completion.title, completion.body, pause_limit.title, pause_limit.body]) {
      expect(() => assertCalmCopy(text, 'timer notification')).not.toThrow();
      expect(text).not.toMatch(/fail|streak|lost|lose|wast/i);
    }
  });
});

describe('a running timer', () => {
  it('is announced at its completion instant C', async () => {
    const app = setup();
    await signIn(app);
    const started = await startTimer(app);

    expect(only(app)).toEqual({
      identifier: timerNotificationId(started.timer!.id),
      userId: ADA,
      sessionId: started.timer!.id,
      event: 'completion',
      at: T0 + 25 * MINUTE,
      sound: true,
      ...TIMER_NOTIFICATION_COPY.completion,
    });
  });

  it('moves C by the time spent paused', async () => {
    const app = setup();
    await signIn(app);
    await startTimer(app);
    app.clock.now = T0 + 5 * MINUTE;
    await app.timers.pause();
    app.clock.now = T0 + 12 * MINUTE;
    await app.timers.resume();
    await app.coordinator.idle();

    expect(only(app)).toMatchObject({ event: 'completion', at: T0 + 32 * MINUTE });
  });

  it('is scheduled once, however many times it is reconciled or the app relaunches', async () => {
    const os = fakeOs();
    const storage = memoryStorage();
    const first = setup(os, storage);
    await signIn(first);
    await startTimer(first);
    await first.coordinator.reconcile();
    await first.coordinator.reconcile();
    first.stop();

    // The app was killed; the OS kept the notification.
    const again = setup(os, storage);
    again.clock.now = T0 + 3 * MINUTE;
    await signIn(again);
    await again.coordinator.reconcile();

    expect(only(again)).toMatchObject({ event: 'completion', at: T0 + 25 * MINUTE });
    expect(os.adapter.schedule).toHaveBeenCalledTimes(1);
  });

  it('follows the sound preference both ways, replacing the scheduled one each time', async () => {
    const app = setup();
    await signIn(app);
    await startTimer(app);
    const loud = only(app);

    await app.coordinator.setSound(false);
    expect(only(app)).toMatchObject({ event: 'completion', at: loud.at, sound: false });
    expect(app.os.adapter.cancel).toHaveBeenCalledWith(loud.identifier);

    jest.mocked(app.os.adapter.cancel).mockClear();
    await app.coordinator.setSound(true);
    expect(only(app)).toMatchObject({ event: 'completion', at: loud.at, sound: true });
    expect(app.os.adapter.cancel).toHaveBeenCalledWith(loud.identifier);
    expect(app.os.adapter.schedule).toHaveBeenCalledTimes(3);
  });

  it('after a relaunch, keeps a notification with the right sound and replaces one with the wrong', async () => {
    const os = fakeOs();
    const storage = memoryStorage();
    const first = setup(os, storage);
    await signIn(first);
    await startTimer(first);
    first.stop();

    // Same preference: nothing to do.
    const same = setup(os, storage);
    await signIn(same);
    await same.coordinator.reconcile();
    expect(os.adapter.schedule).toHaveBeenCalledTimes(1);
    same.stop();

    // The preference changed while the app was gone.
    const changed = setup(os, storage);
    await changed.coordinator.setSound(false);
    await signIn(changed);
    expect(only(changed)).toMatchObject({ event: 'completion', sound: false });
    expect(os.adapter.schedule).toHaveBeenCalledTimes(2);
  });
});

describe('a paused timer', () => {
  it('drops the completion and is announced at the pause limit L', async () => {
    const app = setup();
    await signIn(app);
    await startTimer(app);
    app.clock.now = T0 + 5 * MINUTE;

    await app.timers.pause();
    await app.coordinator.idle();

    expect(only(app)).toMatchObject({
      event: 'pause_limit',
      at: T0 + 35 * MINUTE,
      ...TIMER_NOTIFICATION_COPY.pause_limit,
    });
  });

  it('counts every earlier pause toward L', async () => {
    const app = setup();
    await signIn(app);
    await startTimer(app);
    app.clock.now = T0 + 2 * MINUTE;
    await app.timers.pause();
    app.clock.now = T0 + 10 * MINUTE; // 8 minutes paused
    await app.timers.resume();
    app.clock.now = T0 + 15 * MINUTE;
    await app.timers.pause();
    await app.coordinator.idle();

    // 30 − 8 = 22 minutes of pause left from the second pause.
    expect(only(app)).toMatchObject({ event: 'pause_limit', at: T0 + 37 * MINUTE });
  });

  it('is announced at the new C again once resumed', async () => {
    const app = setup();
    await signIn(app);
    await startTimer(app);
    app.clock.now = T0 + 5 * MINUTE;
    await app.timers.pause();
    app.clock.now = T0 + 9 * MINUTE;
    const limit = only(app);
    jest.mocked(app.os.adapter.cancel).mockClear();
    jest.mocked(app.os.adapter.schedule).mockClear();

    await app.timers.resume();
    await app.coordinator.idle();

    expect(only(app)).toMatchObject({ event: 'completion', at: T0 + 29 * MINUTE });
    // The pause-limit one is cancelled first, not left to be overwritten by the OS.
    expect(app.os.adapter.cancel).toHaveBeenCalledWith(limit.identifier);
    expect(jest.mocked(app.os.adapter.cancel).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(app.os.adapter.schedule).mock.invocationCallOrder[0]!,
    );
  });
});

describe('a session that ends', () => {
  it('leaves nothing when ended early', async () => {
    const app = setup();
    await signIn(app);
    await startTimer(app);
    app.clock.now = T0 + 3 * MINUTE;

    await app.timers.end();
    await app.coordinator.idle();

    expect(pendingList(app)).toEqual([]);
  });

  it('leaves nothing once its completion is stored in the foreground', async () => {
    const app = setup();
    await signIn(app);
    await startTimer(app);
    app.clock.now = T0 + 26 * MINUTE;

    await app.timers.refresh();
    await app.coordinator.idle();

    expect(pendingList(app)).toEqual([]);
  });

  it('leaves nothing once a pause that ran out is stored', async () => {
    const app = setup();
    await signIn(app);
    await startTimer(app);
    app.clock.now = T0 + 5 * MINUTE;
    await app.timers.pause();
    app.clock.now = T0 + 50 * MINUTE;

    await app.timers.refresh();
    await app.coordinator.idle();

    expect(pendingList(app)).toEqual([]);
  });

  it('leaves nothing after a relaunch that finds the session ended, and nothing once it is handed off', async () => {
    const os = fakeOs();
    const storage = memoryStorage();
    const first = setup(os, storage);
    await signIn(first);
    const started = await startTimer(first);
    first.stop();

    const again = setup(os, storage);
    again.clock.now = T0 + 40 * MINUTE;
    await signIn(again);
    expect(pendingList(again)).toEqual([]);

    await again.timers.clearFinished(started.timer!.id);
    await again.coordinator.idle();
    expect(pendingList(again)).toEqual([]);
  });

  it('replaces the last session’s notification when the next one starts', async () => {
    const app = setup();
    await signIn(app);
    await startTimer(app);
    const first = only(app);
    app.clock.now = T0 + 3 * MINUTE;
    await app.timers.end();
    await app.timers.clearFinished(first.sessionId);

    const next = await startTimer(app, 45);

    expect(only(app)).toMatchObject({ sessionId: next.timer!.id, at: T0 + 48 * MINUTE });
  });
});

describe('quick changes', () => {
  it('start then an immediate pause leaves only the pause limit', async () => {
    const app = setup();
    await signIn(app);
    const started = app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    const paused = app.timers.pause();
    await Promise.all([started, paused]);
    await app.coordinator.idle();

    expect(only(app)).toMatchObject({ event: 'pause_limit', at: T0 + 30 * MINUTE });
  });

  it('pause then an immediate resume leaves only the completion', async () => {
    const app = setup();
    await signIn(app);
    await startTimer(app);
    app.clock.now = T0 + MINUTE;
    await Promise.all([app.timers.pause(), app.timers.resume()]);
    await app.coordinator.idle();

    expect(only(app)).toMatchObject({ event: 'completion', at: T0 + 25 * MINUTE });
  });

  it('an end while the schedule is still with the OS leaves nothing', async () => {
    const app = setup();
    await signIn(app);
    let release = () => undefined as void;
    app.os.state.holdSchedule = new Promise<void>((resolve) => {
      release = resolve;
    });
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    app.clock.now = T0 + 2 * MINUTE;
    await app.timers.end();
    release();
    await app.coordinator.idle();

    expect(pendingList(app)).toEqual([]);
  });
});

describe('two people on one device', () => {
  it("never cancels or recreates one user's notification for another", async () => {
    const os = fakeOs();
    const storage = memoryStorage();
    const app = setup(os, storage);
    await signIn(app, ADA);
    await startTimer(app);
    const adas = only(app);

    app.timers.deactivate();
    await app.coordinator.idle();
    await signIn(app, BEA);
    await app.coordinator.reconcile();
    expect(pendingList(app)).toEqual([adas]);

    await startTimer(app, 45);
    expect(pendingList(app)).toHaveLength(2);
    expect(os.pending.get(adas.identifier)).toEqual(adas);
    expect(pendingList(app).find((n) => n.userId === BEA)).toMatchObject({
      at: T0 + 45 * MINUTE,
    });
  });
});

describe('permission', () => {
  it('asks once, when a timer first needs it, then schedules when allowed', async () => {
    const app = setup(fakeOs({ status: 'undetermined', canAskAgain: true }));
    await signIn(app);
    expect(app.os.state.requests).toBe(0);

    await startTimer(app);

    expect(app.os.state.requests).toBe(1);
    expect(only(app).event).toBe('completion');
  });

  it('never blocks the timer when refused, and never asks again', async () => {
    const os = fakeOs({ status: 'undetermined', canAskAgain: true });
    os.state.answer = { status: 'denied', canAskAgain: false };
    const app = setup(os);
    await signIn(app);

    const started = await startTimer(app);
    expect(started.ok).toBe(true);
    expect(app.timers.getSnapshot().timer).not.toBeNull();
    expect(pendingList(app)).toEqual([]);

    app.clock.now = T0 + MINUTE;
    await app.timers.pause();
    await app.timers.resume();
    await app.coordinator.reconcile();
    expect(os.state.requests).toBe(1);
    expect(pendingList(app)).toEqual([]);
  });

  it('schedules nothing and asks nothing when already denied', async () => {
    const app = setup(fakeOs({ status: 'denied', canAskAgain: false }));
    await signIn(app);

    expect((await startTimer(app)).ok).toBe(true);

    expect(app.os.state.requests).toBe(0);
    expect(pendingList(app)).toEqual([]);
  });
});

describe('when the OS refuses', () => {
  it('keeps the timer as stored when scheduling fails, reports it, and repairs next time', async () => {
    const app = setup();
    await signIn(app);
    app.os.state.failSchedule = true;

    const started = await startTimer(app);

    expect(started.ok).toBe(true);
    expect(app.timers.getSnapshot().timer?.id).toBe(started.timer!.id);
    expect(pendingList(app)).toEqual([]);
    expect(app.report).toHaveBeenCalledWith({ code: 'schedule_failed' });

    app.os.state.failSchedule = false;
    await app.coordinator.reconcile();
    expect(only(app)).toMatchObject({ event: 'completion', at: T0 + 25 * MINUTE });
  });

  it('keeps the pause when the old notification cannot be cancelled, and repairs next time', async () => {
    const app = setup();
    await signIn(app);
    await startTimer(app);
    app.os.state.failCancel = true;
    app.clock.now = T0 + 5 * MINUTE;

    const paused = await app.timers.pause();
    await app.coordinator.idle();

    expect(paused.ok).toBe(true);
    expect(app.timers.getSnapshot().timer?.pausedAt).toBe(T0 + 5 * MINUTE);
    expect(app.report).toHaveBeenCalledWith({ code: 'cancel_failed' });

    app.os.state.failCancel = false;
    await app.coordinator.reconcile();
    expect(only(app)).toMatchObject({ event: 'pause_limit', at: T0 + 35 * MINUTE });
  });
});
