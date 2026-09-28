import { NetworkError } from '../../api/errors';
import type { FocusSession } from '../../api/sessions';
import { makeSessionResult } from '../../test-utils/sessions';
import { memoryStorage } from '../../test-utils/storage';
import { activeTimerKey, ActiveTimerStore } from '../../timer/active-timer-store';
import { toSubmission, type SessionSubmissionBody } from '../../timer/submission';
import type { SessionRules, TimerState } from '../../timer/timer-engine';
import { handoffFinishedTimer } from '../session-handoff';
import { sessionOutboxKey, SessionOutbox } from '../session-outbox';

const ADA = '11111111-1111-4111-8111-111111111111';
const TOPIC = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';
const SESSION_ID = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6';
const RULES: SessionRules = { minValidMinutes: 5, maxPauseMinutes: 30 };

const at = (time: string) => Date.parse(`2026-09-27T${time}:00.000Z`);

type Storage = ReturnType<typeof memoryStorage>;
type Send = (id: string, payload: SessionSubmissionBody) => Promise<FocusSession>;

const offline: Send = async () => {
  throw new NetworkError();
};

/** One app process over the device storage: a timer store and an outbox, one clock. */
function launch(storage: Storage, time: string, send: Send = offline) {
  const clock = { now: at(time) };
  const now = () => clock.now;
  const timers = new ActiveTimerStore({
    storage,
    now,
    createId: () => SESSION_ID,
    report: () => undefined,
  });
  const outbox = new SessionOutbox({
    storage,
    now,
    report: () => undefined,
    send,
    isTopicSynced: () => true,
    syncTopics: async () => undefined,
  });
  return {
    timers,
    outbox,
    handoff: () => handoffFinishedTimer({ timers, outbox }),
    setTime: (next: string) => {
      clock.now = at(next);
    },
  };
}

async function activated(storage: Storage, time: string, send?: Send) {
  const app = launch(storage, time, send);
  await Promise.all([app.timers.activate(ADA), app.outbox.activate(ADA)]);
  return app;
}

/** A 25-minute session with one pause, ended by the user at 10:12. */
async function finishedTimer(storage = memoryStorage()) {
  const app = await activated(storage, '10:00');
  await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
  app.setTime('10:05');
  await app.timers.pause();
  app.setTime('10:07');
  await app.timers.resume();
  app.setTime('10:12');
  await app.timers.end();
  const timer = app.timers.getSnapshot().timer as TimerState;
  return { ...app, storage, timer, expected: toSubmission(timer) };
}

const storedTimer = (storage: Storage) => storage.data.get(activeTimerKey(ADA));
const storedItems = (storage: Storage) =>
  (JSON.parse(storage.data.get(sessionOutboxKey(ADA)) ?? '{"items":[]}').items ?? []) as {
    id: string;
    payload: SessionSubmissionBody;
  }[];

describe('handing a finished timer to the outbox', () => {
  it('stores exactly toSubmission() in the outbox, then clears the timer', async () => {
    const { handoff, timers, outbox, storage, expected } = await finishedTimer();

    const result = await handoff();

    expect(result).toEqual({ ok: true, sessionId: SESSION_ID });
    expect(storedItems(storage)).toEqual([
      expect.objectContaining({ id: SESSION_ID, payload: expected.body }),
    ]);
    expect(outbox.getSnapshot().items.map((i) => i.id)).toEqual([SESSION_ID]);
    expect(storedTimer(storage)).toBeUndefined();
    expect(timers.getSnapshot().timer).toBeNull();
  });

  it('writes the outbox before it removes the timer', async () => {
    const { handoff, storage } = await finishedTimer();
    const order: string[] = [];
    (storage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      order.push(`set ${key}`);
      storage.data.set(key, value);
    });
    (storage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
      order.push(`remove ${key}`);
      storage.data.delete(key);
    });

    await handoff();

    expect(order).toEqual([`set ${sessionOutboxKey(ADA)}`, `remove ${activeTimerKey(ADA)}`]);
  });

  it('settles a timer that completed while nobody looked, and hands off its completion', async () => {
    const storage = memoryStorage();
    const app = await activated(storage, '10:00');
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    app.setTime('11:00');

    const result = await app.handoff();

    expect(result).toMatchObject({ ok: true });
    expect(storedItems(storage)[0]?.payload.endedAt).toBe('2026-09-27T10:25:00.000Z');
  });

  it.each([
    ['running', async (app: Awaited<ReturnType<typeof activated>>) => undefined],
    [
      'paused',
      async (app: Awaited<ReturnType<typeof activated>>) => {
        app.setTime('10:05');
        await app.timers.pause();
      },
    ],
  ])('leaves a %s timer alone and queues nothing', async (_mode, prepare) => {
    const storage = memoryStorage();
    const app = await activated(storage, '10:00');
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    await prepare(app);
    const before = app.timers.getSnapshot().timer;

    const result = await app.handoff();

    expect(result).toEqual({ ok: false, reason: 'not_finished' });
    expect(app.timers.getSnapshot().timer).toBe(before);
    expect(storage.data.has(sessionOutboxKey(ADA))).toBe(false);
  });

  it('does nothing without a timer, or before the stores are restored', async () => {
    const storage = memoryStorage();
    const app = await activated(storage, '10:00');
    await expect(app.handoff()).resolves.toEqual({ ok: false, reason: 'no_timer' });

    const idle = launch(storage, '10:00');
    await expect(idle.handoff()).resolves.toEqual({ ok: false, reason: 'not_ready' });
  });

  it('keeps the finished timer when the outbox cannot be stored', async () => {
    const { handoff, timers, storage, timer } = await finishedTimer();
    storage.failing.setItemFor = (key) => key === sessionOutboxKey(ADA);

    const result = await handoff();

    expect(result).toEqual({ ok: false, reason: 'storage_failed' });
    expect(timers.getSnapshot().timer).toBe(timer);
    expect(JSON.parse(storedTimer(storage)!)).toEqual(timer);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('keeps both when the timer cannot be cleared, then dedupes and clears on the next try', async () => {
    const { handoff, timers, storage, expected } = await finishedTimer();
    storage.failing.removeItem = true;

    await expect(handoff()).resolves.toEqual({ ok: false, reason: 'clear_failed' });
    expect(storedItems(storage)).toHaveLength(1);
    expect(timers.getSnapshot().timer).not.toBeNull();

    storage.failing.removeItem = false;
    await expect(handoff()).resolves.toEqual({ ok: true, sessionId: SESSION_ID });

    expect(storedItems(storage)).toEqual([
      expect.objectContaining({ id: SESSION_ID, payload: expected.body }),
    ]);
    expect(timers.getSnapshot().timer).toBeNull();
  });

  it('refuses to overwrite a queued session with another payload under the same id, and keeps the timer', async () => {
    const storage = memoryStorage();
    const { expected } = await finishedTimer(storage);
    const differentEnd = { ...expected.body, endedAt: '2026-09-27T10:13:00.000Z' };
    storage.data.set(
      sessionOutboxKey(ADA),
      JSON.stringify({
        version: 1,
        items: [
          { id: SESSION_ID, payload: differentEnd, state: 'pending', reason: null, queuedAt: 1 },
        ],
      }),
    );
    const app = await activated(storage, '10:30');

    const result = await app.handoff();

    expect(result).toEqual({ ok: false, reason: 'id_conflict' });
    expect(storedItems(storage)).toEqual([expect.objectContaining({ payload: differentEnd })]);
    expect(app.timers.getSnapshot().timer).not.toBeNull();
  });

  it('is safe to call twice at once: one item, timer cleared', async () => {
    const { handoff, timers, storage } = await finishedTimer();

    const results = await Promise.all([handoff(), handoff()]);

    expect(results).toContainEqual({ ok: true, sessionId: SESSION_ID });
    expect(storedItems(storage)).toHaveLength(1);
    expect(timers.getSnapshot().timer).toBeNull();
  });
});

describe('a kill at each point of the handoff loses nothing', () => {
  it('before the outbox write: the finished timer is still there, and hands off next launch', async () => {
    const storage = memoryStorage();
    const { expected } = await finishedTimer(storage);
    // Killed here: nothing was queued yet.

    const next = await activated(storage, '10:30');
    expect(next.timers.getSnapshot().timer?.finished).toEqual({ at: at('10:12'), reason: 'ended' });
    expect(next.outbox.getSnapshot().items).toEqual([]);

    await expect(next.handoff()).resolves.toMatchObject({ ok: true });
    expect(storedItems(storage)).toEqual([expect.objectContaining({ payload: expected.body })]);
    expect(storedTimer(storage)).toBeUndefined();
  });

  it('after the outbox write, before the clear: both are restored, and the next handoff dedupes', async () => {
    const storage = memoryStorage();
    const first = await finishedTimer(storage);
    storage.failing.removeItem = true;
    await first.handoff();
    storage.failing.removeItem = false;
    // Killed here: the session is queued and the timer is still stored.

    const next = await activated(storage, '10:30');
    expect(next.timers.getSnapshot().timer).not.toBeNull();
    expect(next.outbox.getSnapshot().items.map((i) => i.id)).toEqual([SESSION_ID]);

    await expect(next.handoff()).resolves.toEqual({ ok: true, sessionId: SESSION_ID });
    expect(storedItems(storage)).toEqual([
      expect.objectContaining({ id: SESSION_ID, payload: first.expected.body }),
    ]);
    expect(storedTimer(storage)).toBeUndefined();
  });

  it('after the clear: only the outbox is restored, with the same payload', async () => {
    const storage = memoryStorage();
    const first = await finishedTimer(storage);
    await first.handoff();

    const next = await activated(storage, '10:30');

    expect(next.timers.getSnapshot().timer).toBeNull();
    expect(next.outbox.getSnapshot().items.map((i) => i.payload)).toEqual([first.expected.body]);
  });

  it('never has a moment where the timer is gone and the session is not stored', async () => {
    const storage = memoryStorage();
    const { handoff } = await finishedTimer(storage);
    const violations: string[] = [];
    const check = () => {
      if (!storage.data.has(activeTimerKey(ADA)) && !storage.data.has(sessionOutboxKey(ADA))) {
        violations.push('lost');
      }
    };
    const set = storage.setItem as jest.Mock;
    const remove = storage.removeItem as jest.Mock;
    set.mockImplementation(async (key: string, value: string) => {
      storage.data.set(key, value);
      check();
    });
    remove.mockImplementation(async (key: string) => {
      storage.data.delete(key);
      check();
    });

    await handoff();

    expect(violations).toEqual([]);
  });
});

describe('the payload after handoff', () => {
  it('is sent unchanged on every attempt, across a lost answer and a relaunch', async () => {
    const storage = memoryStorage();
    const { handoff, expected } = await finishedTimer(storage);
    await handoff();
    const sent: string[] = [];
    const stored = new Set<string>();
    // The server stores it, but the answer is lost.
    const lose: Send = async (id, payload) => {
      sent.push(JSON.stringify(payload));
      stored.add(id);
      throw new NetworkError();
    };
    const lost = await activated(storage, '10:30', lose);
    await lost.outbox.flush();

    const answer: Send = async (id, payload) => {
      sent.push(JSON.stringify(payload));
      return makeSessionResult({ id, endedAt: '2026-09-27T10:11:00.000Z' });
    };
    const next = await activated(storage, '10:40', answer);
    await next.outbox.flush();

    expect(sent).toEqual([JSON.stringify(expected.body), JSON.stringify(expected.body)]);
    expect(storedItems(storage)).toEqual([]);
    expect(next.outbox.getSnapshot().synced[SESSION_ID]?.endedAt).toBe('2026-09-27T10:11:00.000Z');
  });
});
