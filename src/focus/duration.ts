import type { PickerTopic } from '../topics/topic-create-sync';

/**
 * Focus durations, in whole minutes (docs/02 → Timer; spec §3.3). Pure: the selector shows
 * them and the Start Focus flow hands the chosen minutes to the timer. Nothing here is stored.
 */

/** The presets, in this order (docs/02: 15 / 25 / 45 / 50 / 60 min). */
export const DURATION_PRESETS = [15, 25, 45, 50, 60] as const;

/** The short preset a first session starts with (docs/02 → Onboarding). */
export const FIRST_SESSION_MINUTES = 15;

/**
 * What the mobile selector offers: 5 to 180 minutes in 5-minute steps. A product choice for
 * the selector, narrower than the API's technical 1–1440 minutes.
 */
export const CUSTOM_MIN_MINUTES = 5;
export const CUSTOM_MAX_MINUTES = 180;
export const CUSTOM_STEP_MINUTES = 5;

export function isPresetDuration(minutes: number): boolean {
  return (DURATION_PRESETS as readonly number[]).includes(minutes);
}

/**
 * Whether the selector can offer this duration. `minimum` is the session rules'
 * `minValidMinutes`: a shorter plan would never count, so it is not offered (docs/06).
 */
export function isSelectableDuration(minutes: number, minimum = CUSTOM_MIN_MINUTES): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= CUSTOM_MIN_MINUTES &&
    minutes >= minimum &&
    minutes <= CUSTOM_MAX_MINUTES &&
    minutes % CUSTOM_STEP_MINUTES === 0
  );
}

/**
 * The selection to open with: the remembered duration when the selector can show it,
 * otherwise the first-session preset. A remembered value outside the selector (say 7 or 240,
 * from another client) is set aside, never clamped or rounded into a different duration.
 */
export function initialMinutes(remembered: number | null | undefined): number {
  return remembered != null && isSelectableDuration(remembered)
    ? remembered
    : FIRST_SESSION_MINUTES;
}

/**
 * A picker topic's opening selection. The remembered duration is the server's
 * `lastPlannedMinutes` (its latest session, A2.8); a topic waiting to sync has none yet.
 */
export function initialDurationForTopic(entry: PickerTopic): number {
  return initialMinutes(entry.kind === 'confirmed' ? entry.topic.lastPlannedMinutes : null);
}

/**
 * The shortest duration the selector offers under this minimum: the first 5-minute step at or
 * above it (the rule itself is never rounded). Null when even 180 minutes is below it.
 */
export function lowestSelectableMinutes(minimum: number): number | null {
  const lowest =
    Math.ceil(Math.max(CUSTOM_MIN_MINUTES, minimum) / CUSTOM_STEP_MINUTES) * CUSTOM_STEP_MINUTES;
  return lowest <= CUSTOM_MAX_MINUTES ? lowest : null;
}

export interface DurationRules {
  minValidMinutes: number;
}

/**
 * The duration to start with at once, skipping the choice (docs/02: two taps): the confirmed
 * topic's remembered duration, when the selector can offer it under the current minimum.
 * Null otherwise: the duration is chosen first.
 */
export function quickStartMinutes(entry: PickerTopic, rules: DurationRules): number | null {
  const remembered = entry.kind === 'confirmed' ? entry.topic.lastPlannedMinutes : null;
  return remembered != null && isSelectableDuration(remembered, rules.minValidMinutes)
    ? remembered
    : null;
}

/**
 * What the duration choice opens with: the usable remembered duration; otherwise 15, or the
 * first preset that meets a higher minimum, or the lowest 5-minute step that does. Null when
 * no duration on offer meets the minimum.
 */
export function startMinutesForTopic(entry: PickerTopic, rules: DurationRules): number | null {
  const remembered = quickStartMinutes(entry, rules);
  if (remembered !== null) return remembered;
  const minimum = rules.minValidMinutes;
  if (isSelectableDuration(FIRST_SESSION_MINUTES, minimum)) return FIRST_SESSION_MINUTES;
  const preset = DURATION_PRESETS.find((minutes) => isSelectableDuration(minutes, minimum));
  return preset ?? lowestSelectableMinutes(minimum);
}

/** When the minimum is longer than any duration on offer. */
export const NO_DURATION_MESSAGE = "Focus durations aren't available with the current settings.";

export type CustomMinutes = { ok: true; minutes: number } | { ok: false; message: string };

/** Reads the custom field: whole minutes only, never rounded into range or onto a step. */
export function parseCustomMinutes(text: string, minimum = CUSTOM_MIN_MINUTES): CustomMinutes {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return { ok: false, message: 'Enter the minutes, like 35.' };
  const minutes = Number(trimmed);
  const lowest = lowestSelectableMinutes(minimum);
  if (lowest === null) return { ok: false, message: NO_DURATION_MESSAGE };
  if (minutes < lowest || minutes > CUSTOM_MAX_MINUTES) {
    return { ok: false, message: `Choose a duration from ${lowest} to 180 minutes.` };
  }
  if (minutes % CUSTOM_STEP_MINUTES !== 0) {
    return { ok: false, message: 'Use 5-minute steps, like 35 or 40.' };
  }
  return { ok: true, minutes };
}

/** "25 min": whole minutes, as the presets are named. */
export function formatMinutes(minutes: number): string {
  return `${minutes} min`;
}
