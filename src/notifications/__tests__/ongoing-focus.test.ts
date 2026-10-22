import { assertCalmCopy } from '../../components/calm-copy';
import { memoryStorage } from '../../test-utils/storage';
import { ActiveTimerStore } from '../../timer/active-timer-store';
import {
  createOngoingFocusAdapter,
  OngoingFocusNotification,
  planOngoingFocus,
  type OngoingFocusAdapter,
  type OngoingFocusNotice,
} from '../ongoing-focus';

/**
 * The ongoing notification while a session runs (owner, 2026-10-22): a live countdown in the
 * notification shade, planned from the stored timer like the completion notification. Android
 * counts down by itself; the app only shows, updates, and hides it.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const T0 = Date.parse('2026-10-22T08:00:00.000Z');
const ADA = '11111111-1111-4111-8111-111111111111';
const TOPIC = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';
const RULES = { minValidMinutes: 5, maxPauseMinutes: 30 };
const URL = 'focusforest:///focus';

function fakeShade() {
  const state = { shown: null as OngoingFocusNotice | null, fail: false };
  const adapter: OngoingFocusAdapter = {
    show: jest.fn((notice: OngoingFocusNotice) => {
      if (state.fail) throw new Error('os refused');
      state.shown = notice;
    }),
    hide: jest.fn(() => {
      state.shown = null;
    }),
  };
  return { adapter, state };
}

async function setup() {
  const clock = { now: T0 };
  const timers = new ActiveTimerStore({
    storage: memoryStorage(),
    now: () => clock.now,
    createId: () => '0192f1a2-3b4c-7d5e-8f60-718293000001',
    report: () => undefined,
  });
  const shade = fakeShade();
  const report = jest.fn();
  const ongoing = new OngoingFocusNotification({
    timers,
    adapter: shade.adapter,
    url: URL,
    report,
  });
  const stop = ongoing.start();
  await timers.activate(ADA);
  return { clock, timers, shade, ongoing, report, stop };
}

const start = (app: Awaited<ReturnType<typeof setup>>, plannedMinutes = 25) =>
  app.timers.start({ topicId: TOPIC, plannedMinutes, rules: RULES });

describe('planOngoingFocus', () => {
  it('is nothing without a timer', () => {
    expect(planOngoingFocus({ timer: null, now: T0, url: URL })).toBeNull();
  });

  it('keeps its words calm', () => {
    const paused = (minutes: number) =>
      planOngoingFocus({
        timer: {
          version: 1,
          id: 'a',
          topicId: TOPIC,
          plannedMinutes: 25,
          rules: RULES,
          startedAt: T0,
          pauses: [],
          pausedAt: T0 + minutes * MINUTE,
          finished: null,
        },
        now: T0 + minutes * MINUTE,
        url: URL,
      })!;
    for (const notice of [paused(5), paused(0)]) {
      expect(() => assertCalmCopy(notice.title, 'ongoing focus')).not.toThrow();
      expect(() => assertCalmCopy(notice.body, 'ongoing focus')).not.toThrow();
    }
  });
});

describe('the ongoing focus notification', () => {
  it('counts down to the end while a session runs, and goes away on its own at the end', async () => {
    const app = await setup();
    await start(app);
    expect(app.shade.state.shown).toEqual({
      title: 'Focusing',
      body: 'Your tree is growing. Tap to return.',
      countdownTo: T0 + 25 * MINUTE,
      timeoutAt: T0 + 25 * MINUTE,
      url: URL,
    });
  });

  it('stops counting while paused, says what is left, and leaves when the pause runs out', async () => {
    const app = await setup();
    await start(app);
    app.clock.now = T0 + 7 * MINUTE + 30 * SECOND;
    await app.timers.pause();
    expect(app.shade.state.shown).toEqual({
      title: 'Paused',
      body: "17:30 left. Resume when you're ready.",
      countdownTo: 0,
      timeoutAt: T0 + 7 * MINUTE + 30 * SECOND + 30 * MINUTE,
      url: URL,
    });
  });

  it('counts again on resume, to an end moved by the pause', async () => {
    const app = await setup();
    await start(app);
    app.clock.now = T0 + 5 * MINUTE;
    await app.timers.pause();
    app.clock.now = T0 + 8 * MINUTE;
    await app.timers.resume();
    expect(app.shade.state.shown).toMatchObject({
      title: 'Focusing',
      countdownTo: T0 + 28 * MINUTE,
      timeoutAt: T0 + 28 * MINUTE,
    });
  });

  it('shows hours when more than an hour is left', async () => {
    const app = await setup();
    await start(app, 90);
    app.clock.now = T0 + 10 * MINUTE;
    await app.timers.pause();
    expect(app.shade.state.shown?.body).toBe("1:20:00 left. Resume when you're ready.");
  });

  it('goes away when the session ends', async () => {
    const app = await setup();
    await start(app);
    app.clock.now = T0 + 10 * MINUTE;
    await app.timers.end();
    expect(app.shade.state.shown).toBeNull();
    expect(app.shade.adapter.hide).toHaveBeenCalled();
  });

  it('goes away on sign-out', async () => {
    const app = await setup();
    await start(app);
    app.timers.deactivate();
    expect(app.shade.state.shown).toBeNull();
  });

  it('is not posted again while nothing changed', async () => {
    const app = await setup();
    await start(app);
    const shows = (app.shade.adapter.show as jest.Mock).mock.calls.length;
    app.ongoing.reconcile();
    app.ongoing.reconcile();
    expect(app.shade.adapter.show).toHaveBeenCalledTimes(shows);
  });

  it('comes back on refresh, after being swiped away (Android 14 lets people do that)', async () => {
    const app = await setup();
    await start(app);
    app.shade.state.shown = null;
    app.ongoing.refresh();
    expect(app.shade.state.shown).toMatchObject({ title: 'Focusing' });
  });

  it('never reaches the timer when the OS refuses, and tries again later', async () => {
    const app = await setup();
    app.shade.state.fail = true;
    await start(app);
    expect(app.report).toHaveBeenCalledWith({ code: 'show_failed' });
    expect(app.timers.getSnapshot().timer).not.toBeNull();
    app.shade.state.fail = false;
    app.ongoing.refresh();
    expect(app.shade.state.shown).toMatchObject({ title: 'Focusing' });
  });

  it('stops following the timer once stopped', async () => {
    const app = await setup();
    app.stop();
    await start(app);
    expect(app.shade.adapter.show).not.toHaveBeenCalled();
  });
});

describe('createOngoingFocusAdapter', () => {
  it('passes the notice to the native module, in its argument order', () => {
    const native = { show: jest.fn(), hide: jest.fn() };
    const adapter = createOngoingFocusAdapter(() => native);
    adapter.show({ title: 'Focusing', body: 'b', countdownTo: 10, timeoutAt: 20, url: URL });
    adapter.hide();
    expect(native.show).toHaveBeenCalledWith('Focusing', 'b', 10, 20, URL);
    expect(native.hide).toHaveBeenCalledTimes(1);
  });

  it('does nothing where the module is missing (Expo Go, iOS, an older build)', () => {
    const adapter = createOngoingFocusAdapter(() => null);
    expect(() => {
      adapter.show({ title: 'Focusing', body: 'b', countdownTo: 10, timeoutAt: 20, url: URL });
      adapter.hide();
    }).not.toThrow();
  });
});
