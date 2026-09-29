/**
 * How the Focus screen writes a time the timer engine derived. Display only: whether and when
 * a session ends is the engine's answer (`derive`, `settle`), never what these show.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** Whole seconds left, rounded up, so 00:00 shows only once no time is left. Never negative. */
function secondsLeft(milliseconds: number): number {
  return Math.ceil(Math.max(0, milliseconds) / SECOND);
}

const pad = (value: number) => String(value).padStart(2, '0');

/** The countdown: 24:59, or 01:05:07 from an hour up. */
export function formatCountdown(milliseconds: number): string {
  const total = secondsLeft(milliseconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

const unit = (value: number, name: string) => `${value} ${name}${value === 1 ? '' : 's'}`;

/** The countdown in words, for a screen reader that asks for it: "24 minutes 59 seconds left". */
export function spokenTimeLeft(milliseconds: number): string {
  const total = secondsLeft(milliseconds);
  if (total === 0) return 'No time left';
  const parts = [
    [Math.floor(total / 3600), 'hour'],
    [Math.floor((total % 3600) / 60), 'minute'],
    [total % 60, 'second'],
  ] as const;
  return `${parts
    .filter(([value]) => value > 0)
    .map(([value, name]) => unit(value, name))
    .join(' ')} left`;
}

/** Whole minutes focused of the plan: "10 of 25 min". */
export function focusedText(focusedMilliseconds: number, plannedMinutes: number): string {
  return `${Math.floor(Math.max(0, focusedMilliseconds) / MINUTE)} of ${plannedMinutes} min`;
}

/**
 * The progress ring's value, in whole focused minutes of the plan (0–100). The countdown
 * carries the seconds; the ring moves once a minute, so it animates about as many times as the
 * plan has minutes instead of on every tick (docs/04 §9: minimize redraws). Full exactly when
 * the plan is reached.
 */
export function ringPercent(focusedMilliseconds: number, plannedMinutes: number): number {
  const minutes = Math.floor(Math.max(0, focusedMilliseconds) / MINUTE);
  return Math.min(100, (minutes / plannedMinutes) * 100);
}
