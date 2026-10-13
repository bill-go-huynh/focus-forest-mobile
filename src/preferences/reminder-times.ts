/**
 * The three reminders with a local time (A6.2; docs/11: reminder times are user-set). Without
 * a time the server never plans one, so turning a reminder on for the first time also sets a
 * suggestion, which the person moves right there (M6.1).
 */
export const REMINDER_CATEGORIES = [
  'dailyGoalReminder',
  'scheduledFocusReminder',
  'streakReminder',
] as const;
export type ReminderCategory = (typeof REMINDER_CATEGORIES)[number];

/** Evening for the goal and the streak (the streak later, after the goal's), morning for focus. */
export const SUGGESTED_TIMES: Record<ReminderCategory, string> = {
  dailyGoalReminder: '19:00',
  scheduledFocusReminder: '09:00',
  streakReminder: '20:00',
};

const DAY = 24 * 60;
const QUARTER = 15;

/** "HH:MM" moved by a quarter hour (`step` ±15), to the next quarter that way, around midnight. */
export function shiftTime(time: string, step: 15 | -15): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const current = hours * 60 + minutes;
  const snapped =
    step > 0
      ? Math.floor(current / QUARTER) * QUARTER + QUARTER
      : Math.ceil(current / QUARTER) * QUARTER - QUARTER;
  const next = ((snapped % DAY) + DAY) % DAY;
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
}
