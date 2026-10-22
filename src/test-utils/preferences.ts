import type { Preferences } from '../api/preferences';

/** A5 defaults: system theme, sound on, motion not reduced, every category off. */
export function makePreferences(overrides: Partial<Preferences> = {}): Preferences {
  const off = { enabled: false };
  const reminder = { enabled: false, time: null };
  return {
    theme: 'system',
    sound: true,
    reducedMotion: false,
    shareUsageData: true,
    notifications: {
      dailyGoalReminder: reminder,
      scheduledFocusReminder: reminder,
      streakReminder: reminder,
      friendInvite: off,
      focusRoomInvite: off,
      challengeUpdate: off,
      badgeUnlocked: off,
      monthlyRecapReady: off,
    },
    ...overrides,
  };
}
