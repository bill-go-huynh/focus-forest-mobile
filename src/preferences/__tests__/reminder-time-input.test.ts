import { parseReminderTime } from '../reminder-times';

describe('a typed reminder time (owner, 2026-10-23)', () => {
  it.each([
    ['7:05', '07:05'],
    ['07:05', '07:05'],
    ['19:30', '19:30'],
    [' 23:59 ', '23:59'],
    ['0:00', '00:00'],
    ['8.45', '08:45'],
  ])('reads %s as %s', (text, time) => {
    expect(parseReminderTime(text)).toEqual({ ok: true, time });
  });

  it.each(['24:00', '7:60', '7', 'seven', '', '19:3'])('refuses %s calmly', (text) => {
    expect(parseReminderTime(text)).toEqual({
      ok: false,
      message: 'Enter a time such as 7:05 or 19:30.',
    });
  });
});
