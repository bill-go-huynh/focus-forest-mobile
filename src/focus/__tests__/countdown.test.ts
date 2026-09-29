import { focusedText, formatCountdown, ringPercent, spokenTimeLeft } from '../countdown';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe('formatCountdown', () => {
  it.each([
    [25 * MINUTE, '25:00'],
    [25 * MINUTE - 1, '25:00'],
    [24 * MINUTE + 59 * SECOND, '24:59'],
    [MINUTE, '01:00'],
    [9 * SECOND, '00:09'],
    [1, '00:01'],
    [0, '00:00'],
    [HOUR, '01:00:00'],
    [HOUR - 1, '01:00:00'],
    [HOUR - SECOND, '59:59'],
    [3 * HOUR, '03:00:00'],
    [HOUR + 5 * MINUTE + 7 * SECOND, '01:05:07'],
  ])('shows %i ms as %s (whole seconds, rounded up)', (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });

  it('never shows a negative time', () => {
    expect(formatCountdown(-1)).toBe('00:00');
    expect(formatCountdown(-5 * MINUTE)).toBe('00:00');
  });
});

describe('spokenTimeLeft', () => {
  it.each([
    [25 * MINUTE, '25 minutes left'],
    [24 * MINUTE + 59 * SECOND, '24 minutes 59 seconds left'],
    [MINUTE + SECOND, '1 minute 1 second left'],
    [30 * SECOND, '30 seconds left'],
    [HOUR + 5 * MINUTE, '1 hour 5 minutes left'],
    [2 * HOUR, '2 hours left'],
    [0, 'No time left'],
    [-SECOND, 'No time left'],
  ])('reads %i ms as “%s”', (ms, text) => {
    expect(spokenTimeLeft(ms)).toBe(text);
  });

  it('rounds the same way as the countdown shows', () => {
    expect(spokenTimeLeft(25 * MINUTE - 1)).toBe('25 minutes left');
  });
});

describe('focusedText', () => {
  it('counts whole minutes focused of the plan', () => {
    expect(focusedText(0, 25)).toBe('0 of 25 min');
    expect(focusedText(10 * MINUTE + 59 * SECOND, 25)).toBe('10 of 25 min');
    expect(focusedText(25 * MINUTE, 25)).toBe('25 of 25 min');
  });

  it('never goes below 0', () => {
    expect(focusedText(-MINUTE, 25)).toBe('0 of 25 min');
  });
});

describe('ringPercent', () => {
  it('moves only with whole focused minutes', () => {
    expect(ringPercent(0, 25)).toBe(0);
    expect(ringPercent(59 * SECOND, 25)).toBe(0);
    expect(ringPercent(MINUTE, 25)).toBe(4);
    expect(ringPercent(2 * MINUTE + 59 * SECOND, 25)).toBe(8);
    expect(ringPercent(3 * MINUTE, 25)).toBe(12);
  });

  it('is full exactly when the plan is reached, and never beyond or below', () => {
    expect(ringPercent(25 * MINUTE - 1, 25)).toBe(96);
    expect(ringPercent(25 * MINUTE, 25)).toBe(100);
    expect(ringPercent(30 * MINUTE, 25)).toBe(100);
    expect(ringPercent(-MINUTE, 25)).toBe(0);
  });
});
