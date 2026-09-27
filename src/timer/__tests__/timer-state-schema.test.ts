import {
  end,
  pause,
  resume,
  settle,
  start,
  type TimerResult,
  type TimerState,
} from '../timer-engine';
import { parseTimerState } from '../timer-state-schema';

const ID = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6';
const TOPIC = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';
const RULES = { minValidMinutes: 5, maxPauseMinutes: 30 };

const at = (time: string) => Date.parse(`2026-09-27T${time.length === 5 ? `${time}:00` : time}Z`);

type Step = ['pause' | 'resume' | 'end' | 'settle', string];

function run(steps: Step[], plannedMinutes = 25): TimerState {
  const begun = start({ id: ID, topicId: TOPIC, plannedMinutes, rules: RULES, now: at('10:00') });
  if (!begun.ok) throw new Error(begun.reason);
  return steps.reduce((state, [action, time]) => {
    if (action === 'settle') return settle(state, at(time));
    const result: TimerResult = { pause, resume, end }[action](state, at(time));
    if (!result.ok) throw new Error(result.reason);
    return result.state;
  }, begun.state);
}

/** What storage would hand back: plain JSON, no shared references. */
const stored = (state: TimerState): unknown => JSON.parse(JSON.stringify(state));

const running = run([
  ['pause', '10:05'],
  ['resume', '10:07'],
]);

describe('parseTimerState', () => {
  it.each<[string, TimerState]>([
    ['a running timer', run([])],
    ['a running timer with pauses', running],
    ['a paused timer', run([['pause', '10:05']])],
    [
      'an empty pause',
      run([
        ['pause', '10:05'],
        ['resume', '10:05'],
      ]),
    ],
    ['a completed timer', run([['settle', '12:00']])],
    [
      'a completed timer after pauses',
      run([
        ['pause', '10:05'],
        ['resume', '10:07'],
        ['settle', '12:00'],
      ]),
    ],
    [
      'a timer ended at the pause limit',
      run(
        [
          ['pause', '10:05'],
          ['settle', '12:00'],
        ],
        60,
      ),
    ],
    ['a timer ended early', run([['end', '10:12']])],
    [
      'a timer ended while paused',
      run([
        ['pause', '10:12'],
        ['end', '10:20'],
      ]),
    ],
    ['a timer ended the moment it started', run([['end', '10:00']])],
  ])('accepts %s exactly as the engine wrote it', (_case, state) => {
    expect(parseTimerState(stored(state))).toEqual({ ok: true, state });
  });

  it('treats any other version as unsupported, without reading it as version 1', () => {
    expect(parseTimerState({ ...(stored(running) as object), version: 2 })).toEqual({
      ok: false,
      reason: 'unsupported_version',
    });
  });

  const base = stored(running) as Record<string, unknown>;
  const pausesOf = (...pairs: [string, string][]) =>
    pairs.map(([from, to]) => ({ startedAt: at(from), endedAt: at(to) }));

  it.each<[string, unknown]>([
    ['null', null],
    ['a list', [base]],
    ['text', JSON.stringify(base)],
    ['no version', { ...base, version: undefined }],
    ['an unknown field', { ...base, extra: true }],
    ['an uppercase id', { ...base, id: ID.toUpperCase() }],
    ['an id that is not a UUID', { ...base, id: 'session-1' }],
    ['a topic id that is not a UUID', { ...base, topicId: 42 }],
    ['0 planned minutes', { ...base, plannedMinutes: 0 }],
    ['1441 planned minutes', { ...base, plannedMinutes: 1441 }],
    ['fractional planned minutes', { ...base, plannedMinutes: 2.5 }],
    ['no rules', { ...base, rules: undefined }],
    ['a fractional minimum', { ...base, rules: { ...RULES, minValidMinutes: 2.5 } }],
    ['a negative pause limit', { ...base, rules: { ...RULES, maxPauseMinutes: -1 } }],
    [
      'a pause limit that was NaN (null in JSON)',
      { ...base, rules: { ...RULES, maxPauseMinutes: null } },
    ],
    ['a start written as text', { ...base, startedAt: '2026-09-27T10:00:00.000Z' }],
    ['a fractional start', { ...base, startedAt: at('10:00') + 0.5 }],
    ['pauses that are not a list', { ...base, pauses: {} }],
    ['a pause without an end', { ...base, pauses: [{ startedAt: at('10:05') }] }],
    ['a pause that ends before it starts', { ...base, pauses: pausesOf(['10:07', '10:05']) }],
    ['a pause before the start', { ...base, pauses: pausesOf(['09:55', '10:05']) }],
    ['overlapping pauses', { ...base, pauses: pausesOf(['10:05', '10:08'], ['10:07', '10:09']) }],
    ['pauses out of order', { ...base, pauses: pausesOf(['10:10', '10:11'], ['10:05', '10:06']) }],
    ['a closed pause longer than the limit', { ...base, pauses: pausesOf(['10:05', '10:40']) }],
    ['a pause that starts after the completion', { ...base, pauses: pausesOf(['10:30', '10:31']) }],
    ['an open pause before the last closed one ends', { ...base, pausedAt: at('10:06') }],
    ['an open pause after the completion', { ...base, pauses: [], pausedAt: at('10:26') }],
    [
      'an open pause on a finished timer',
      { ...(stored(run([['end', '10:12']])) as object), pausedAt: at('10:12') },
    ],
    ['an unknown finish reason', { ...base, finished: { at: at('10:12'), reason: 'cancelled' } }],
    ['a finish before the start', { ...base, finished: { at: at('09:59'), reason: 'ended' } }],
    [
      'a finish before the last pause ends',
      { ...base, finished: { at: at('10:06'), reason: 'ended' } },
    ],
    [
      'a completion at the wrong instant',
      { ...base, finished: { at: at('10:40'), reason: 'completed' } },
    ],
    [
      'an early end after the completion',
      { ...base, finished: { at: at('10:40'), reason: 'ended' } },
    ],
    [
      'a pause limit at the wrong instant',
      {
        ...(stored(
          run(
            [
              ['pause', '10:05'],
              ['settle', '12:00'],
            ],
            60,
          ),
        ) as object),
        finished: { at: at('10:50'), reason: 'pause_limit' },
      },
    ],
  ])('rejects %s', (_case, value) => {
    expect(parseTimerState(value)).toEqual({ ok: false, reason: 'invalid_state' });
  });
});
