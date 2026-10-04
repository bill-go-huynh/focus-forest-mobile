import {
  defaultGoals,
  makeGoals,
  makeRestDays,
  makeStreak,
  streakWithOffer,
} from '../../test-utils/consistency';
import type { ApiClient } from '../client';
import {
  acceptRecovery,
  cancelRestDay,
  clearWeeklyGoal,
  consistencyErrorCode,
  getGoals,
  getRestDays,
  getStreak,
  goalsSchema,
  restDaysSchema,
  scheduleRestDay,
  setDailyGoal,
  setWeeklyGoal,
  streakSchema,
} from '../consistency';
import { HttpError, NetworkError } from '../errors';

function recordingClient(answer: unknown = {}) {
  const calls: { path: string; options: Record<string, unknown> }[] = [];
  const client = {
    request: jest.fn(async (path: string, options: Record<string, unknown> = {}) => {
      calls.push({ path, options });
      return answer;
    }),
  } as unknown as ApiClient;
  return { client, calls };
}

describe('goals, rest days, and streak contracts (A3.2)', () => {
  describe('goalsSchema', () => {
    it('accepts the current goal, the default suggestion, and pending changes', () => {
      expect(goalsSchema.safeParse(makeGoals()).success).toBe(true);
      expect(goalsSchema.parse(defaultGoals()).daily.isDefault).toBe(true);
      const pending = makeGoals({ pending: { minutes: 45, effectiveFrom: '2026-10-08' } });
      expect(goalsSchema.parse(pending).daily.pending).toEqual({
        minutes: 45,
        effectiveFrom: '2026-10-08',
      });
    });

    it('keeps no weekly goal as null, never as a target of zero', () => {
      const parsed = goalsSchema.parse(makeGoals());
      expect(parsed.weekly).toEqual({ goal: null, pending: null, thisWeek: null });
      const zero = {
        ...makeGoals(),
        weekly: { ...makeGoals().weekly, goal: { type: 'session_count', target: 0 } },
      };
      expect(goalsSchema.safeParse(zero).success).toBe(false);
    });

    it('accepts a pending weekly change, and a pending end (goal null from a Monday)', () => {
      const goals = makeGoals();
      for (const goal of [{ type: 'session_count', target: 5 }, null]) {
        const value = {
          ...goals,
          weekly: { ...goals.weekly, pending: { goal, effectiveFrom: '2026-10-12' } },
        };
        expect(goalsSchema.safeParse(value).success).toBe(true);
      }
    });

    it.each([
      ['an unknown weekly type', { type: 'pages', target: 3 }],
      ['a fractional target', { type: 'focused_minutes', target: 1.5 }],
    ])('refuses %s', (_, goal) => {
      const goals = makeGoals();
      expect(goalsSchema.safeParse({ ...goals, weekly: { ...goals.weekly, goal } }).success).toBe(
        false,
      );
    });
  });

  describe('restDaysSchema', () => {
    it('accepts planned dates and the weekly allowance', () => {
      const parsed = restDaysSchema.parse(makeRestDays(['2026-10-07', '2026-10-14']));
      expect(parsed.restDays).toEqual([{ date: '2026-10-07' }, { date: '2026-10-14' }]);
      expect(parsed.allowance).toEqual({
        perWeek: 2,
        weekStart: '2026-10-05',
        used: 1,
        remaining: 1,
      });
    });

    it.each([
      ['a date with a time', { ...makeRestDays(), restDays: [{ date: '2026-10-07T00:00:00Z' }] }],
      ['a negative allowance', makeRestDays([], { remaining: -1 })],
      ['no allowance', { restDays: [] }],
    ])('refuses %s', (_, value) => {
      expect(restDaysSchema.safeParse(value).success).toBe(false);
    });
  });

  describe('streakSchema', () => {
    it('accepts the streak, its milestones, and a recovery offer or none', () => {
      expect(streakSchema.parse(makeStreak()).recovery.offer).toBeNull();
      expect(streakSchema.parse(streakWithOffer()).recovery.offer).toEqual({
        missedDate: '2026-10-06',
        returnDate: '2026-10-07',
        previousStreak: 12,
      });
    });

    it.each([
      ['an unknown today', makeStreak({ today: 'failed' as never })],
      ['a negative streak', makeStreak({ current: -1 })],
    ])('refuses %s', (_, value) => {
      expect(streakSchema.safeParse(value).success).toBe(false);
    });
  });

  describe('requests', () => {
    it('reads goals, rest days, and the streak', async () => {
      const { client, calls } = recordingClient();
      await getGoals(client);
      await getRestDays(client);
      await getStreak(client);
      expect(calls.map((c) => [c.path, c.options.method ?? 'GET'])).toEqual([
        ['/me/goals', 'GET'],
        ['/me/rest-days', 'GET'],
        ['/me/streak', 'GET'],
      ]);
      expect(calls.every((c) => c.options.schema)).toBe(true);
    });

    it('writes goals exactly as the API takes them', async () => {
      const { client, calls } = recordingClient();
      await setDailyGoal(client, 45);
      await setWeeklyGoal(client, { type: 'session_count', target: 5 });
      await clearWeeklyGoal(client);
      expect(calls.map((c) => [c.path, c.options.method, c.options.body])).toEqual([
        ['/me/goals/daily', 'PUT', { minutes: 45 }],
        ['/me/goals/weekly', 'PUT', { type: 'session_count', target: 5 }],
        ['/me/goals/weekly', 'DELETE', undefined],
      ]);
    });

    it('plans and cancels a rest day by its date, and accepts the offered recovery', async () => {
      const { client, calls } = recordingClient();
      await scheduleRestDay(client, '2026-10-08');
      await cancelRestDay(client, '2026-10-08');
      await acceptRecovery(client, '2026-10-06');
      expect(calls.map((c) => [c.path, c.options.method, c.options.body])).toEqual([
        ['/me/rest-days/2026-10-08', 'PUT', undefined],
        ['/me/rest-days/2026-10-08', 'DELETE', undefined],
        ['/me/streak/recoveries', 'POST', { missedDate: '2026-10-06' }],
      ]);
    });

    it('refuses to send a rest day that is not a calendar date', async () => {
      const { client, calls } = recordingClient();
      await expect(scheduleRestDay(client, '../goals')).rejects.toThrow();
      expect(calls).toHaveLength(0);
    });
  });

  describe('consistencyErrorCode', () => {
    it.each([
      [422, 'rest_day_in_past'],
      [422, 'rest_day_today_not_allowed'],
      [422, 'rest_day_too_far_ahead'],
      [409, 'rest_allowance_used'],
      [404, 'rest_day_not_found'],
      [422, 'return_window_passed'],
      [422, 'monthly_limit_reached'],
    ])('reads a %i %s by its code', (status, code) => {
      const error = new HttpError(status, { statusCode: status, message: 'Any text.', code });
      expect(consistencyErrorCode(error)).toBe(code);
    });

    it('reads an invalid value (400) as invalid_value, and anything else as null', () => {
      expect(
        consistencyErrorCode(
          new HttpError(400, { statusCode: 400, message: ['minutes must be at least 1.'] }),
        ),
      ).toBe('invalid_value');
      expect(consistencyErrorCode(new NetworkError())).toBeNull();
      expect(consistencyErrorCode(new HttpError(500, {}))).toBeNull();
    });
  });
});
