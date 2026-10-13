import { REMINDER_CATEGORIES, shiftTime, SUGGESTED_TIMES } from '../reminder-times';

/** M6.1 Reminder times (docs/11: user-set): moved by quarter hours, suggested when first on. */
describe('reminder times (M6.1)', () => {
  it('moves a time by quarter hours, around midnight both ways', () => {
    expect(shiftTime('19:00', 15)).toBe('19:15');
    expect(shiftTime('19:00', -15)).toBe('18:45');
    expect(shiftTime('23:45', 15)).toBe('00:00');
    expect(shiftTime('00:00', -15)).toBe('23:45');
  });

  it('snaps a time off the quarter to the next quarter in the direction moved', () => {
    expect(shiftTime('19:07', 15)).toBe('19:15');
    expect(shiftTime('19:07', -15)).toBe('19:00');
  });

  it('suggests a time for each reminder, since without one nothing is ever sent', () => {
    expect(REMINDER_CATEGORIES).toEqual([
      'dailyGoalReminder',
      'scheduledFocusReminder',
      'streakReminder',
    ]);
    expect(SUGGESTED_TIMES).toEqual({
      dailyGoalReminder: '19:00',
      scheduledFocusReminder: '09:00',
      streakReminder: '20:00',
    });
  });
});
