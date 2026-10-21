import * as Haptics from 'expo-haptics';
import { createContext, createElement, useCallback, useContext, type ReactNode } from 'react';
import { Platform } from 'react-native';

/**
 * The app's haptics (docs/04 §9, docs/11 → Haptics), always paired with something seen or said:
 * - `complete`: one soft signal when a focus session reaches its end on screen;
 * - `milestone`: a slightly richer one for a new stage or trait, an unlock, and a planted seed;
 * - `select`: a light tick on pickers only.
 * None while a session runs. Off unless the signed-in user's Haptics setting is on.
 *
 * Android uses the view's haptic feedback, so the system's touch-feedback setting applies; iOS
 * follows the system's own haptics setting.
 */
export type HapticKind = 'complete' | 'milestone' | 'select';

export function playHaptic(kind: HapticKind): void {
  try {
    const played =
      Platform.OS === 'android'
        ? Haptics.performAndroidHapticsAsync(
            kind === 'complete'
              ? Haptics.AndroidHaptics.Confirm
              : kind === 'milestone'
                ? Haptics.AndroidHaptics.Long_Press
                : Haptics.AndroidHaptics.Segment_Tick,
          )
        : kind === 'complete'
          ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)
          : kind === 'milestone'
            ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
            : Haptics.selectionAsync();
    // A device without haptics just stays still.
    void Promise.resolve(played).catch(() => undefined);
  } catch {
    // Same: never let a missing vibrator break the moment it accompanies.
  }
}

const HapticsEnabled = createContext(false);

/** Whether haptics play below: the signed-in user's Haptics setting (AppearanceProviders). */
export function HapticsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return createElement(HapticsEnabled.Provider, { value: enabled }, children);
}

/** Plays a haptic when Haptics is on; otherwise (and outside a provider) does nothing. */
export function useHaptic(): (kind: HapticKind) => void {
  const on = useContext(HapticsEnabled);
  return useCallback((kind: HapticKind) => (on ? playHaptic(kind) : undefined), [on]);
}
