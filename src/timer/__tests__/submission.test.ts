import { focusedMillisecondsOf, toSubmission } from '../submission';
import {
  derive,
  end,
  pause,
  resume,
  settle,
  start,
  type SessionRules,
  type TimerState,
} from '../timer-engine';

const RULES: SessionRules = { minValidMinutes: 5, maxPauseMinutes: 30 };
const ID = '0192F1A2-3B4C-7D5E-8F60-718293A4B5C6';
const TOPIC = '5D1C3F5E-2A4B-4C6D-8E7F-9A0B1C2D3E4F';

const at = (time: string) => Date.parse(`2026-09-27T${time.length === 5 ? `${time}:00` : time}Z`);
const iso = (time: string) => new Date(at(time)).toISOString();

type Step = ['pause' | 'resume' | 'end' | 'settle', string];

function run(steps: Step[], plannedMinutes = 25, rules: SessionRules = RULES): TimerState {
  const begun = start({ id: ID, topicId: TOPIC, plannedMinutes, rules, now: at('10:00') });
  if (!begun.ok) throw new Error(begun.reason);
  return steps.reduce((state, [action, time]) => {
    if (action === 'settle') return settle(state, at(time));
    const result = { pause, resume, end }[action](state, at(time));
    if (!result.ok) throw new Error(result.reason);
    return result.state;
  }, begun.state);
}

describe('toSubmission', () => {
  it('builds exactly the PUT /me/sessions/:id payload, with lowercase ids', () => {
    const state = run([
      ['pause', '10:05'],
      ['resume', '10:07'],
      ['end', '10:12'],
    ]);

    expect(toSubmission(state)).toStrictEqual({
      id: ID.toLowerCase(),
      body: {
        topicId: TOPIC.toLowerCase(),
        startedAt: '2026-09-27T10:00:00.000Z',
        endedAt: '2026-09-27T10:12:00.000Z',
        plannedMinutes: 25,
        pauseIntervals: [
          { startedAt: '2026-09-27T10:05:00.000Z', endedAt: '2026-09-27T10:07:00.000Z' },
        ],
      },
    });
  });

  it('keeps milliseconds in every time', () => {
    const state = run([
      ['pause', '10:05:00.123'],
      ['resume', '10:05:00.456'],
      ['end', '10:12:34.789'],
    ]);
    const { body } = toSubmission(state);
    expect(body.endedAt).toBe('2026-09-27T10:12:34.789Z');
    expect(body.pauseIntervals).toEqual([
      { startedAt: '2026-09-27T10:05:00.123Z', endedAt: '2026-09-27T10:05:00.456Z' },
    ]);
  });

  it('sends the planned minutes, not the time left', () => {
    expect(toSubmission(run([['end', '10:12']], 45)).body.plannedMinutes).toBe(45);
  });

  it('refuses a timer that has not finished', () => {
    expect(() => toSubmission(run([['pause', '10:05']]))).toThrow(/not finished/);
  });

  it('gives the same payload every time, so a retry resends it unchanged', () => {
    const state = run([['settle', '14:00']]);
    const first = toSubmission(state);
    const restored = JSON.parse(JSON.stringify(state)) as TimerState;

    expect(toSubmission(settle(restored, at('18:00')))).toStrictEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toStrictEqual(first);
  });
});

// The same situations as the API evaluator's tests (A2.4, focus-forest-api
// src/sessions/evaluation/evaluate-session.spec.ts), as the user lives them. For each, the
// submitted end is the effective end the server derives from the same times, so the server
// agrees with what the timer showed.
describe('agreement with the server evaluator (A2.4)', () => {
  it.each<[string, Step[], number, SessionRules, string, [string, string][]]>([
    ['completion without pauses', [['settle', '11:40']], 25, RULES, '10:25', []],
    ['an early end', [['end', '10:12']], 25, RULES, '10:12', []],
    ['an end the moment it started', [['end', '10:00']], 25, RULES, '10:00', []],
    [
      'completion pushed back by a pause',
      [
        ['pause', '10:10'],
        ['resume', '10:15'],
        ['settle', '11:00'],
      ],
      25,
      RULES,
      '10:30',
      [['10:10', '10:15']],
    ],
    [
      'a pause across the naive completion',
      [
        ['pause', '10:20'],
        ['resume', '10:40'],
        ['settle', '11:00'],
      ],
      25,
      RULES,
      '10:45',
      [['10:20', '10:40']],
    ],
    [
      'exactly the maximum pause',
      [
        ['pause', '10:05'],
        ['resume', '10:35'],
        ['settle', '11:00'],
      ],
      25,
      RULES,
      '10:55',
      [['10:05', '10:35']],
    ],
    [
      'one long pause reaching the maximum',
      [
        ['pause', '10:05'],
        ['settle', '11:00'],
      ],
      60,
      RULES,
      '10:35',
      [['10:05', '10:35']],
    ],
    [
      'pauses adding up to the maximum before completion',
      [
        ['pause', '10:05'],
        ['resume', '10:20'],
        ['pause', '10:25'],
        ['settle', '11:30'],
      ],
      25,
      RULES,
      '10:40',
      [
        ['10:05', '10:20'],
        ['10:25', '10:40'],
      ],
    ],
    [
      'the pause limit below the minimum',
      [
        ['pause', '10:03'],
        ['settle', '11:00'],
      ],
      25,
      RULES,
      '10:33',
      [['10:03', '10:33']],
    ],
    [
      'an end while paused',
      [
        ['pause', '10:12'],
        ['end', '10:20'],
      ],
      25,
      RULES,
      '10:20',
      [['10:12', '10:20']],
    ],
    [
      'a configured maximum of 45 minutes',
      [
        ['pause', '10:10'],
        ['settle', '12:00'],
      ],
      60,
      { minValidMinutes: 5, maxPauseMinutes: 45 },
      '10:55',
      [['10:10', '10:55']],
    ],
  ])('%s', (_case, steps, plannedMinutes, rules, endedAt, pauses) => {
    const { body } = toSubmission(run(steps, plannedMinutes, rules));

    expect(body.endedAt).toBe(iso(endedAt));
    expect(body.pauseIntervals).toEqual(
      pauses.map(([from, to]) => ({ startedAt: iso(from), endedAt: iso(to) })),
    );
  });
});

describe('focusedMillisecondsOf (a queued submission, for Session Completion)', () => {
  it.each<[string, Step[]]>([
    ['completed', [['settle', '10:30']]],
    ['ended early', [['end', '10:12']]],
    [
      'with pauses',
      [
        ['pause', '10:05'],
        ['resume', '10:07'],
        ['pause', '10:10'],
        ['end', '10:20'],
      ],
    ],
    [
      'at the pause limit',
      [
        ['pause', '10:05'],
        ['settle', '11:00'],
      ],
    ],
  ])('agrees with the timer engine when %s', (_case, steps) => {
    const state = run(steps);
    expect(focusedMillisecondsOf(toSubmission(state).body)).toBe(
      derive(state, state.finished!.at).focusedMilliseconds,
    );
  });
});
