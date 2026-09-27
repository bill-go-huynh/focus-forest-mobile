import {
  derive,
  end,
  pause,
  resume,
  settle,
  start,
  type SessionRules,
  type TimerResult,
  type TimerState,
} from '../timer-engine';

const MINUTE = 60_000;
const RULES: SessionRules = { minValidMinutes: 5, maxPauseMinutes: 30 };
const ID = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6';
const TOPIC = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';

/** An instant on 27 September 2026 (UTC), as epoch milliseconds: `at('10:05')`, `at('10:05:00.001')`. */
const at = (time: string) => Date.parse(`2026-09-27T${time.length === 5 ? `${time}:00` : time}Z`);

function started(plannedMinutes = 25, rules: SessionRules = RULES, now = at('10:00')): TimerState {
  const result = start({ id: ID, topicId: TOPIC, plannedMinutes, rules, now });
  if (!result.ok) throw new Error(`start failed: ${result.reason}`);
  return result.state;
}

function ok(result: TimerResult): TimerState {
  if (!result.ok) throw new Error(`action failed: ${result.reason}`);
  return result.state;
}

type Step = ['pause' | 'resume' | 'end', string];

/** Starts at 10:00 and applies each step, which must succeed. */
function run(steps: Step[], plannedMinutes = 25, rules: SessionRules = RULES): TimerState {
  const actions = { pause, resume, end };
  return steps.reduce(
    (state, [action, time]) => ok(actions[action](state, at(time))),
    started(plannedMinutes, rules),
  );
}

describe('start', () => {
  it('starts at the exact instant, with the full plan ahead', () => {
    const state = started();

    expect(state.startedAt).toBe(at('10:00'));
    expect(derive(state, at('10:00'))).toMatchObject({
      mode: 'running',
      focusedMilliseconds: 0,
      pausedMilliseconds: 0,
      remainingMilliseconds: 25 * MINUTE,
      progress: 0,
      completionAt: at('10:25'),
      pauseLimitAt: null,
      endedAt: null,
      finishReason: null,
    });
  });

  it('keeps a snapshot of the session rules it started with', () => {
    expect(started(25, { minValidMinutes: 10, maxPauseMinutes: 45 }).rules).toEqual({
      minValidMinutes: 10,
      maxPauseMinutes: 45,
    });
  });

  it("copies the rules, so a later change to the caller's object cannot move any instant", () => {
    const rules = { minValidMinutes: 5, maxPauseMinutes: 30 };
    const state = started(60, rules);
    rules.maxPauseMinutes = 45;
    expect(state.rules.maxPauseMinutes).toBe(30);
  });

  it('stores ids in lowercase, as the API does', () => {
    const result = start({
      id: ID.toUpperCase(),
      topicId: TOPIC.toUpperCase(),
      plannedMinutes: 25,
      rules: RULES,
      now: at('10:00'),
    });

    expect(result).toMatchObject({ ok: true, state: { id: ID, topicId: TOPIC } });
  });

  it.each([
    ['invalid_id', { id: 'not-a-uuid' }],
    ['invalid_id', { id: '' }],
    ['invalid_topic_id', { topicId: 'reading' }],
    ['invalid_planned_minutes', { plannedMinutes: 0 }],
    ['invalid_planned_minutes', { plannedMinutes: 1441 }],
    ['invalid_planned_minutes', { plannedMinutes: 2.5 }],
    ['invalid_planned_minutes', { plannedMinutes: Number.NaN }],
    ['invalid_rules', { rules: { minValidMinutes: -1, maxPauseMinutes: 30 } }],
    ['invalid_rules', { rules: { minValidMinutes: 2.5, maxPauseMinutes: 30 } }],
    ['invalid_rules', { rules: { minValidMinutes: 5, maxPauseMinutes: Number.NaN } }],
    ['invalid_time', { now: Number.NaN }],
    ['invalid_time', { now: at('10:00') + 0.5 }],
  ])('refuses to start with %s: %j', (reason, override) => {
    const input = { id: ID, topicId: TOPIC, plannedMinutes: 25, rules: RULES, now: at('10:00') };
    expect(start({ ...input, ...override })).toEqual({ ok: false, reason });
  });

  it.each([1, 1440])('accepts %i planned minutes', (plannedMinutes) => {
    expect(started(plannedMinutes).plannedMinutes).toBe(plannedMinutes);
  });
});

describe('running', () => {
  it('derives focused and remaining time from timestamps alone, however long between reads', () => {
    const state = started();

    expect(derive(state, at('10:10'))).toMatchObject({
      focusedMilliseconds: 10 * MINUTE,
      remainingMilliseconds: 15 * MINUTE,
      progress: 0.4,
    });
    // Reading again, or reading a later instant directly, gives the same answer.
    expect(derive(state, at('10:10'))).toEqual(derive(state, at('10:10')));
    expect(derive(state, at('10:24:59.999'))).toMatchObject({
      focusedMilliseconds: 25 * MINUTE - 1,
      remainingMilliseconds: 1,
    });
  });

  it('keeps every millisecond, without rounding to seconds', () => {
    expect(derive(started(), at('10:00:01.234'))).toMatchObject({
      focusedMilliseconds: 1234,
      remainingMilliseconds: 25 * MINUTE - 1234,
    });
  });

  it('never goes backwards when the clock reads earlier than the last event', () => {
    expect(derive(started(), at('09:59'))).toMatchObject({
      focusedMilliseconds: 0,
      remainingMilliseconds: 25 * MINUTE,
    });
  });

  it('does not change the state it reads', () => {
    const state = started();
    const copy = structuredClone(state);
    derive(state, at('11:00'));
    settle(state, at('11:00'));
    expect(state).toEqual(copy);
  });
});

describe('completion', () => {
  it('completes at the planned focus without pauses', () => {
    const state = settle(started(), at('10:25'));
    expect(state.finished).toEqual({ at: at('10:25'), reason: 'completed' });
  });

  it('is pushed back by a pause', () => {
    const state = run([
      ['pause', '10:10'],
      ['resume', '10:15'],
    ]);
    expect(derive(state, at('10:20')).completionAt).toBe(at('10:30'));
    expect(settle(state, at('10:30')).finished).toEqual({ at: at('10:30'), reason: 'completed' });
  });

  it('is pushed back by several pauses', () => {
    const state = run([
      ['pause', '10:05'],
      ['resume', '10:07'],
      ['pause', '10:10'],
      ['resume', '10:13'],
    ]);
    expect(settle(state, at('11:00')).finished?.at).toBe(at('10:30'));
  });

  it('counts a pause across the naive completion time once', () => {
    const state = run([
      ['pause', '10:20'],
      ['resume', '10:40'],
    ]);
    expect(settle(state, at('11:00')).finished?.at).toBe(at('10:45'));
  });

  it('keeps the exact completion instant when settled hours later, and settles only once', () => {
    const once = settle(started(), at('14:00'));
    const again = settle(once, at('18:00'));

    expect(once.finished).toEqual({ at: at('10:25'), reason: 'completed' });
    expect(again).toEqual(once);
    expect(derive(once, at('23:00'))).toMatchObject({
      mode: 'finished',
      finishReason: 'completed',
      endedAt: at('10:25'),
      focusedMilliseconds: 25 * MINUTE,
      remainingMilliseconds: 0,
      progress: 1,
      completionAt: at('10:25'),
    });
  });

  it('shows a completion that has happened even before it is settled', () => {
    expect(derive(started(), at('12:00'))).toMatchObject({
      mode: 'finished',
      endedAt: at('10:25'),
    });
  });

  it('refuses a pause at or after completion, which leaves the completion unchanged', () => {
    const atCompletion = pause(started(), at('10:25'));
    const later = pause(started(), at('10:40'));

    expect(atCompletion).toMatchObject({ ok: false, reason: 'finished' });
    expect(atCompletion.state.finished).toEqual({ at: at('10:25'), reason: 'completed' });
    expect(later.state.finished?.at).toBe(at('10:25'));
  });
});

describe('pause and resume', () => {
  it('stops focus while paused and adds pauses up', () => {
    const state = run([
      ['pause', '10:05'],
      ['resume', '10:08'],
      ['pause', '10:10'],
    ]);

    expect(state.pauses).toEqual([{ startedAt: at('10:05'), endedAt: at('10:08') }]);
    expect(state.pausedAt).toBe(at('10:10'));
    expect(derive(state, at('10:12'))).toMatchObject({
      mode: 'paused',
      focusedMilliseconds: 7 * MINUTE,
      pausedMilliseconds: 5 * MINUTE,
      remainingMilliseconds: 18 * MINUTE,
      completionAt: null,
      pauseLimitAt: at('10:37'),
    });
  });

  it('records a pause and resume at the same instant as an empty pause', () => {
    const state = run([
      ['pause', '10:05'],
      ['resume', '10:05'],
    ]);
    expect(state.pauses).toEqual([{ startedAt: at('10:05'), endedAt: at('10:05') }]);
    expect(derive(state, at('10:10')).focusedMilliseconds).toBe(10 * MINUTE);
  });

  it.each([
    ['pause while paused', 'already_paused', () => pause(run([['pause', '10:05']]), at('10:06'))],
    ['resume while running', 'not_paused', () => resume(started(), at('10:06'))],
    ['pause after the end', 'finished', () => pause(run([['end', '10:10']]), at('10:11'))],
    ['resume after the end', 'finished', () => resume(run([['end', '10:10']]), at('10:11'))],
    [
      'act before the last event',
      'time_went_backwards',
      () => resume(run([['pause', '10:05']]), at('10:04')),
    ],
    ['act at a fractional instant', 'invalid_time', () => pause(started(), at('10:05') + 0.5)],
  ])('refuses to %s (%s) and leaves the state intact', (_case, reason, act) => {
    const result = act();
    expect(result).toMatchObject({ ok: false, reason });
  });

  it('returns the same state when an action is refused', () => {
    const paused = run([['pause', '10:05']]);
    expect(pause(paused, at('10:06')).state).toBe(paused);
    expect(resume(paused, at('10:04')).state).toBe(paused);
  });
});

describe('pause limit', () => {
  it('allows a pause of exactly the maximum', () => {
    const state = run([
      ['pause', '10:05'],
      ['resume', '10:35'],
    ]);
    expect(state.finished).toBeNull();
    expect(settle(state, at('11:00')).finished).toEqual({ at: at('10:55'), reason: 'completed' });
  });

  it('is still paused, not ended, at the very instant the maximum is reached', () => {
    const state = run([['pause', '10:05']]);
    expect(settle(state, at('10:35')).finished).toBeNull();
    expect(derive(state, at('10:35'))).toMatchObject({
      mode: 'paused',
      pausedMilliseconds: 30 * MINUTE,
      pauseLimitAt: at('10:35'),
    });
  });

  it('allows 1 ms below the maximum', () => {
    const state = run([
      ['pause', '10:05'],
      ['resume', '10:34:59.999'],
    ]);
    expect(derive(state, at('10:40'))).toMatchObject({
      mode: 'running',
      pausedMilliseconds: 30 * MINUTE - 1,
    });
  });

  it('ends at the instant the maximum is reached once the pause goes past it', () => {
    const state = settle(run([['pause', '10:05']], 60), at('10:35:00.001'));

    expect(state.finished).toEqual({ at: at('10:35'), reason: 'pause_limit' });
    expect(state.pausedAt).toBeNull();
    expect(state.pauses).toEqual([{ startedAt: at('10:05'), endedAt: at('10:35') }]);
  });

  it('adds pauses up to the maximum', () => {
    const state = run([
      ['pause', '10:05'],
      ['resume', '10:20'],
      ['pause', '10:25'],
    ]);
    expect(settle(state, at('11:30')).finished).toEqual({ at: at('10:40'), reason: 'pause_limit' });
    expect(derive(state, at('11:30'))).toMatchObject({
      focusedMilliseconds: 10 * MINUTE,
      pausedMilliseconds: 30 * MINUTE,
      endedAt: at('10:40'),
    });
  });

  it('derives the same instant when restored long after, and ends a short session below the minimum', () => {
    const state = run([['pause', '10:03']]);
    const restored = settle(state, at('20:00'));

    expect(restored.finished).toEqual({ at: at('10:33'), reason: 'pause_limit' });
    expect(derive(restored, at('21:00'))).toMatchObject({
      focusedMilliseconds: 3 * MINUTE,
      reachedMinimum: false,
    });
  });

  it('refuses a resume after the limit has passed, keeping the end at the limit', () => {
    const result = resume(run([['pause', '10:05']]), at('10:50'));
    expect(result).toMatchObject({ ok: false, reason: 'finished' });
    expect(result.state.finished).toEqual({ at: at('10:35'), reason: 'pause_limit' });
  });

  it.each([
    [30, '10:40'],
    [45, '10:55'],
    [0, '10:10'],
  ])('uses the configured maximum of %i minutes', (maxPauseMinutes, limit) => {
    const state = run([['pause', '10:10']], 60, { minValidMinutes: 5, maxPauseMinutes });
    expect(settle(state, at('12:00')).finished).toEqual({ at: at(limit), reason: 'pause_limit' });
  });
});

describe('ending early', () => {
  it('ends while running at the given instant', () => {
    const state = run([['end', '10:12']]);
    expect(state.finished).toEqual({ at: at('10:12'), reason: 'ended' });
    expect(derive(state, at('11:00'))).toMatchObject({
      mode: 'finished',
      focusedMilliseconds: 12 * MINUTE,
      remainingMilliseconds: 13 * MINUTE,
      reachedMinimum: true,
    });
  });

  it('closes an open pause at the end', () => {
    const state = run([
      ['pause', '10:12'],
      ['end', '10:20'],
    ]);
    expect(state.pausedAt).toBeNull();
    expect(state.pauses).toEqual([{ startedAt: at('10:12'), endedAt: at('10:20') }]);
    expect(state.finished).toEqual({ at: at('10:20'), reason: 'ended' });
  });

  it('can end the moment it started', () => {
    const state = run([['end', '10:00']]);
    expect(derive(state, at('10:00'))).toMatchObject({
      endedAt: at('10:00'),
      focusedMilliseconds: 0,
      reachedMinimum: false,
    });
  });

  it('settles to the completion when ended after it, instead of the later end', () => {
    expect(run([['end', '11:40']]).finished).toEqual({ at: at('10:25'), reason: 'completed' });
  });

  it('settles to the pause limit when ended after it while paused', () => {
    const state = run([
      ['pause', '10:05'],
      ['end', '11:00'],
    ]);
    expect(state.finished).toEqual({ at: at('10:35'), reason: 'pause_limit' });
  });

  it('keeps the first end when ended again', () => {
    const ended = run([['end', '10:12']]);
    const again = end(ended, at('10:20'));
    expect(again).toEqual({ ok: true, state: ended });
  });

  it('tells whether the focused time reached the configured minimum, to the millisecond', () => {
    const rules = { minValidMinutes: 10, maxPauseMinutes: 30 };
    expect(derive(run([['end', '10:09:59.999']], 25, rules), at('11:00')).reachedMinimum).toBe(
      false,
    );
    expect(derive(run([['end', '10:10']], 25, rules), at('11:00')).reachedMinimum).toBe(true);
  });
});

describe('serialization', () => {
  it('is plain JSON that round-trips without changing any result', () => {
    const state = run([
      ['pause', '10:05:00.123'],
      ['resume', '10:07:30.456'],
      ['pause', '10:10'],
    ]);

    const restored = JSON.parse(JSON.stringify(state)) as TimerState;

    expect(restored).toEqual(state);
    for (const time of ['10:12', '10:39:59.999', '10:40:30']) {
      expect(derive(restored, at(time))).toEqual(derive(state, at(time)));
    }
    expect(ok(resume(restored, at('10:15')))).toEqual(ok(resume(state, at('10:15'))));
  });

  it('holds no Date or other non-JSON value', () => {
    const state = settle(
      run([
        ['pause', '10:05'],
        ['resume', '10:06'],
      ]),
      at('11:00'),
    );
    const values: unknown[] = [];
    JSON.stringify(state, (_key, value: unknown) => {
      values.push(value);
      return value;
    });
    expect(values.every((value) => !(value instanceof Date) && typeof value !== 'function')).toBe(
      true,
    );
    expect(values.filter((value) => typeof value === 'number').every(Number.isInteger)).toBe(true);
  });
});
