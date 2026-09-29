import { memoryStorage } from '../../test-utils/storage';
import { ActiveTimerStore } from '../../timer/active-timer-store';
import { toSubmission } from '../../timer/submission';
import type { TimerState } from '../../timer/timer-engine';
import { CompletionIntents } from '../completion-intents';

const ADA = '11111111-1111-4111-8111-111111111111';
const BEA = '22222222-2222-4222-8222-222222222222';
const S1 = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6';
const TOPIC = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';
const T0 = Date.parse('2026-09-29T08:00:00.000Z');
const RULES = { minValidMinutes: 5, maxPauseMinutes: 30 };

async function setup(storage = memoryStorage()) {
  const clock = { now: T0 };
  const timers = new ActiveTimerStore({
    storage,
    now: () => clock.now,
    createId: () => S1,
    report: () => undefined,
  });
  const intents = new CompletionIntents();
  const stop = intents.watch(timers);
  return { clock, timers, intents, stop, storage };
}

describe('CompletionIntents', () => {
  it('asks to show a session that ended while this app had it running, once it is handed off', async () => {
    const app = await setup();
    await app.timers.activate(ADA);
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    await app.timers.end();
    expect(app.intents.getSnapshot().pending).toBeNull();

    await app.timers.clearFinished(S1);

    expect(app.intents.getSnapshot().pending).toEqual({
      userId: ADA,
      sessionId: S1,
      source: 'foreground',
    });
  });

  it('does not ask for a session that had already ended before this launch', async () => {
    const storage = memoryStorage();
    const earlier = await setup(storage);
    await earlier.timers.activate(ADA);
    await earlier.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    earlier.stop();

    const app = await setup(storage);
    app.clock.now = T0 + 40 * 60_000;
    await app.timers.activate(ADA);
    const finished = app.timers.getSnapshot().timer as TimerState;
    await app.timers.clearFinished(toSubmission(finished).id);

    expect(app.intents.getSnapshot().pending).toBeNull();
  });

  it('does not ask when the timer only went away with a sign-out', async () => {
    const app = await setup();
    await app.timers.activate(ADA);
    await app.timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });

    app.timers.deactivate();
    await app.timers.activate(BEA);

    expect(app.intents.getSnapshot().pending).toBeNull();
  });

  it('shows each session once: a repeated request after it was shown is ignored', () => {
    const intents = new CompletionIntents();
    intents.request({ userId: ADA, sessionId: S1, source: 'tap' });
    intents.request({ userId: ADA, sessionId: S1, source: 'tap' });
    expect(intents.getSnapshot().pending?.sessionId).toBe(S1);

    intents.shown(S1);
    intents.request({ userId: ADA, sessionId: S1, source: 'tap' });

    expect(intents.getSnapshot().pending).toBeNull();
  });

  it('can drop a request that is not for the signed-in user', () => {
    const intents = new CompletionIntents();
    intents.request({ userId: ADA, sessionId: S1, source: 'tap' });

    intents.drop(S1);

    expect(intents.getSnapshot().pending).toBeNull();
  });
});
