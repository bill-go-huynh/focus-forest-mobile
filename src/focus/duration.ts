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

export function isSelectableDuration(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= CUSTOM_MIN_MINUTES &&
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

export type CustomMinutes = { ok: true; minutes: number } | { ok: false; message: string };

/** Reads the custom field: whole minutes only, never rounded into range or onto a step. */
export function parseCustomMinutes(text: string): CustomMinutes {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return { ok: false, message: 'Enter the minutes, like 35.' };
  const minutes = Number(trimmed);
  if (minutes < CUSTOM_MIN_MINUTES || minutes > CUSTOM_MAX_MINUTES) {
    return { ok: false, message: 'Choose a duration from 5 to 180 minutes.' };
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
