import { makeTopic } from '../../test-utils/topics';
import type { PickerTopic } from '../../topics/topic-create-sync';
import {
  DURATION_PRESETS,
  FIRST_SESSION_MINUTES,
  formatMinutes,
  initialDurationForTopic,
  initialMinutes,
  isPresetDuration,
  isSelectableDuration,
  lowestSelectableMinutes,
  parseCustomMinutes,
  quickStartMinutes,
  startMinutesForTopic,
} from '../duration';

const confirmed = (lastPlannedMinutes: number | null): PickerTopic => ({
  kind: 'confirmed',
  topic: makeTopic({
    lastPlannedMinutes,
    lastUsedAt: lastPlannedMinutes ? makeTopic().lastUsedAt : null,
  }),
});
const pending: PickerTopic = {
  kind: 'pending',
  id: 'aaaaaaaa-0000-4000-8000-00000000000a',
  name: 'Drawing',
  icon: 'topic.default',
  color: 'topic.1',
  description: null,
  syncState: 'pending',
};

describe('presets (docs/02: 15 / 25 / 45 / 50 / 60 min)', () => {
  it('are exactly these, in this order', () => {
    expect(DURATION_PRESETS).toEqual([15, 25, 45, 50, 60]);
  });

  it('recognizes a preset', () => {
    expect(DURATION_PRESETS.every(isPresetDuration)).toBe(true);
    expect(isPresetDuration(30)).toBe(false);
    expect(isPresetDuration(35)).toBe(false);
  });

  it('first sessions use the short preset (docs/02: 15 min)', () => {
    expect(FIRST_SESSION_MINUTES).toBe(15);
  });
});

describe('isSelectableDuration (the mobile range: 5 to 180 minutes in 5-minute steps)', () => {
  it.each([5, 10, 15, 35, 60, 95, 175, 180])('accepts %p', (minutes) => {
    expect(isSelectableDuration(minutes)).toBe(true);
  });

  it.each([0, 4, 7, 12, 181, 185, 240, 1440, -5, 17.5, 35.0001, Number.NaN, Infinity])(
    'refuses %p',
    (minutes) => {
      expect(isSelectableDuration(minutes)).toBe(false);
    },
  );
});

describe('initialMinutes (from the remembered duration, never clamped or rounded)', () => {
  it('starts a topic without a remembered duration at 15', () => {
    expect(initialMinutes(null)).toBe(15);
    expect(initialMinutes(undefined)).toBe(15);
  });

  it('keeps a remembered preset', () => {
    expect(initialMinutes(25)).toBe(25);
    expect(initialMinutes(60)).toBe(60);
  });

  it('keeps a remembered custom duration the selector can show', () => {
    expect(initialMinutes(35)).toBe(35);
    expect(initialMinutes(5)).toBe(5);
    expect(initialMinutes(180)).toBe(180);
  });

  it.each([3, 7, 12, 181, 240, 1440])(
    'falls back to 15 for a remembered %p it cannot show, instead of changing it',
    (minutes) => {
      const initial = initialMinutes(minutes);
      expect(initial).toBe(15);
      // Neither clamped (to 5 or 180) nor rounded (to the nearest step).
      expect(initial).not.toBe(Math.min(180, Math.max(5, minutes)));
      expect(initial).not.toBe(Math.round(minutes / 5) * 5);
    },
  );
});

describe('initialDurationForTopic', () => {
  it("uses a confirmed topic's remembered duration", () => {
    expect(initialDurationForTopic(confirmed(45))).toBe(45);
    expect(initialDurationForTopic(confirmed(35))).toBe(35);
  });

  it('uses 15 for a confirmed topic never used, and for one waiting to sync', () => {
    expect(initialDurationForTopic(confirmed(null))).toBe(15);
    expect(initialDurationForTopic(pending)).toBe(15);
  });

  it('uses 15 when the remembered duration is outside the selector', () => {
    expect(initialDurationForTopic(confirmed(240))).toBe(15);
  });

  it('never changes the topic', () => {
    const entry = confirmed(240);
    const before = JSON.stringify(entry);
    initialDurationForTopic(entry);
    expect(JSON.stringify(entry)).toBe(before);
  });
});

describe('parseCustomMinutes (what the custom field accepts)', () => {
  it.each([
    ['35', 35],
    ['5', 5],
    ['180', 180],
    [' 40 ', 40],
  ])('accepts %p', (text, minutes) => {
    expect(parseCustomMinutes(text)).toEqual({ ok: true, minutes });
  });

  it.each([
    ['', 'Enter the minutes, like 35.'],
    ['abc', 'Enter the minutes, like 35.'],
    ['35.5', 'Enter the minutes, like 35.'],
    ['3,5', 'Enter the minutes, like 35.'],
    ['-10', 'Enter the minutes, like 35.'],
    ['4', 'Choose a duration from 5 to 180 minutes.'],
    ['0', 'Choose a duration from 5 to 180 minutes.'],
    ['181', 'Choose a duration from 5 to 180 minutes.'],
    ['7', 'Use 5-minute steps, like 35 or 40.'],
    ['33', 'Use 5-minute steps, like 35 or 40.'],
  ])('refuses %p calmly, without rounding it', (text, message) => {
    expect(parseCustomMinutes(text)).toEqual({ ok: false, message });
  });
});

describe('formatMinutes', () => {
  it('writes whole minutes', () => {
    expect(formatMinutes(15)).toBe('15 min');
    expect(formatMinutes(60)).toBe('60 min');
    expect(formatMinutes(180)).toBe('180 min');
  });
});

describe('with the session minimum (GET /session-rules → minValidMinutes)', () => {
  const rules = (minValidMinutes: number) => ({ minValidMinutes, maxPauseMinutes: 30 });

  describe('lowestSelectableMinutes', () => {
    it.each([
      [1, 5],
      [5, 5],
      [7, 10],
      [15, 15],
      [20, 20],
      [21, 25],
      [180, 180],
    ])('is %p → %p: the first 5-minute step at or above the minimum', (minimum, lowest) => {
      expect(lowestSelectableMinutes(minimum)).toBe(lowest);
    });

    it('is null when the minimum is above the longest selectable duration', () => {
      expect(lowestSelectableMinutes(181)).toBeNull();
      expect(lowestSelectableMinutes(240)).toBeNull();
    });
  });

  describe('isSelectableDuration with a minimum', () => {
    it('refuses durations below it, and keeps the 5-minute steps', () => {
      expect(isSelectableDuration(15, 20)).toBe(false);
      expect(isSelectableDuration(20, 20)).toBe(true);
      expect(isSelectableDuration(7, 7)).toBe(false);
      expect(isSelectableDuration(10, 7)).toBe(true);
    });
  });

  describe('quickStartMinutes (start straight away with the remembered duration)', () => {
    it('is the remembered duration when it can be chosen and meets the minimum', () => {
      expect(quickStartMinutes(confirmed(25), rules(5))).toBe(25);
      expect(quickStartMinutes(confirmed(35), rules(5))).toBe(35);
      expect(quickStartMinutes(confirmed(20), rules(20))).toBe(20);
    });

    it('is null without a usable remembered duration: the duration is chosen first', () => {
      expect(quickStartMinutes(confirmed(null), rules(5))).toBeNull();
      expect(quickStartMinutes(pending, rules(5))).toBeNull();
      expect(quickStartMinutes(confirmed(7), rules(5))).toBeNull();
      expect(quickStartMinutes(confirmed(240), rules(5))).toBeNull();
      // Below the current minimum: it would never count.
      expect(quickStartMinutes(confirmed(15), rules(20))).toBeNull();
    });
  });

  describe('startMinutesForTopic (what the duration choice opens with)', () => {
    it('is the usable remembered duration', () => {
      expect(startMinutesForTopic(confirmed(35), rules(5))).toBe(35);
    });

    it('is 15 without one, under the usual minimum', () => {
      expect(startMinutesForTopic(confirmed(null), rules(5))).toBe(15);
      expect(startMinutesForTopic(pending, rules(15))).toBe(15);
    });

    it('is the first preset at or above a higher minimum, never 15', () => {
      expect(startMinutesForTopic(confirmed(null), rules(20))).toBe(25);
      expect(startMinutesForTopic(confirmed(15), rules(20))).toBe(25);
      expect(startMinutesForTopic(pending, rules(46))).toBe(50);
    });

    it('is the lowest 5-minute step when no preset meets the minimum', () => {
      expect(startMinutesForTopic(confirmed(null), rules(61))).toBe(65);
      expect(startMinutesForTopic(confirmed(null), rules(180))).toBe(180);
    });

    it('is null when no duration can meet the minimum', () => {
      expect(startMinutesForTopic(confirmed(null), rules(181))).toBeNull();
      expect(startMinutesForTopic(confirmed(200), rules(181))).toBeNull();
    });
  });

  describe('parseCustomMinutes with a minimum', () => {
    it('refuses durations below it and names the real range', () => {
      expect(parseCustomMinutes('15', 20)).toEqual({
        ok: false,
        message: 'Choose a duration from 20 to 180 minutes.',
      });
      expect(parseCustomMinutes('5', 7)).toEqual({
        ok: false,
        message: 'Choose a duration from 10 to 180 minutes.',
      });
      expect(parseCustomMinutes('10', 7)).toEqual({ ok: true, minutes: 10 });
    });
  });
});
