import type { FocusSession } from '../../api/sessions';
import { makeSessionResult } from '../../test-utils/sessions';
import { memoryStorage } from '../../test-utils/storage';
import { ActiveTimerStore } from '../../timer/active-timer-store';
import { toSubmission } from '../../timer/submission';
import { sessionConfirmedOnServer } from '../app-session-notes';
import { SessionOutbox } from '../session-outbox';

const ADA = '11111111-1111-4111-8111-111111111111';
const BEA = '22222222-2222-4222-8222-222222222222';
const S = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6';
const TOPIC = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';
const T0 = Date.parse('2026-09-29T08:00:00.000Z');
const MINUTE = 60_000;

/** A send the test answers, so each step between handoff and answer can be looked at. */
function deferredSend() {
  const calls: { resolve: (session: FocusSession) => void }[] = [];
  const send = (id: string) =>
    new Promise<FocusSession>((resolve) =>
      calls.push({ resolve: (session) => resolve({ ...session, id }) }),
    );
  return { send, calls };
}

async function setup() {
  const storage = memoryStorage();
  const clock = { now: T0 };
  const timers = new ActiveTimerStore({
    storage,
    now: () => clock.now,
    createId: () => S,
    report: () => undefined,
  });
  const server = deferredSend();
  const sessions = new SessionOutbox({
    storage,
    now: () => clock.now,
    report: () => undefined,
    send: server.send,
    isTopicSynced: () => true,
    syncTopics: async () => undefined,
  });
  await timers.activate(ADA);
  await sessions.activate(ADA);
  const confirmed = sessionConfirmedOnServer({ sessions, timers });
  return { timers, sessions, server, clock, confirmed };
}

async function until(condition: () => boolean) {
  for (let i = 0; i < 100 && !condition(); i += 1) await Promise.resolve();
  if (!condition()) throw new Error('condition never met');
}

describe('sessionConfirmedOnServer (when a note may be sent)', () => {
  it('is false while the timer still holds the session, though the outbox has never seen it', async () => {
    const app = await setup();
    await app.timers.start({
      topicId: TOPIC,
      plannedMinutes: 25,
      rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
    });
    expect(app.confirmed(ADA, S)).toBe(false);

    app.clock.now = T0 + 10 * MINUTE;
    await app.timers.end();
    // Finished, not handed off yet: still only the device has it.
    expect(app.sessions.getSnapshot().items).toEqual([]);
    expect(app.confirmed(ADA, S)).toBe(false);
  });

  it('stays false once handed off, until the PUT is answered, then is true', async () => {
    const app = await setup();
    await app.timers.start({
      topicId: TOPIC,
      plannedMinutes: 25,
      rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
    });
    app.clock.now = T0 + 10 * MINUTE;
    const ended = await app.timers.end();
    if (!ended.ok) throw new Error('The end was refused.');

    await app.sessions.enqueue(ADA, toSubmission(ended.timer));
    await app.timers.clearFinished(S);
    expect(app.timers.getSnapshot().timer).toBeNull();
    const flushing = app.sessions.flush();
    await until(() => app.server.calls.length === 1);
    expect(app.confirmed(ADA, S)).toBe(false);

    app.server.calls[0]!.resolve(makeSessionResult());
    await flushing;
    expect(app.sessions.getSnapshot().items).toEqual([]);
    expect(app.confirmed(ADA, S)).toBe(true);
  });

  it('is unknown until both the timer and the outbox are read for that user', async () => {
    const app = await setup();
    expect(app.confirmed(BEA, S)).toBeNull();

    app.timers.deactivate();
    expect(app.confirmed(ADA, S)).toBeNull();
  });

  it('is true for another session while the timer holds a different one', async () => {
    const app = await setup();
    await app.timers.start({
      topicId: TOPIC,
      plannedMinutes: 25,
      rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
    });
    expect(app.confirmed(ADA, '0192f1a2-3b4c-7d5e-8f60-000000000009')).toBe(true);
  });
});
