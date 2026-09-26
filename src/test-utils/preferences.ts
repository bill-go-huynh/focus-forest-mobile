import type { Preferences } from '../api/preferences';

/** A5 defaults: system theme, sound and haptics on, motion not reduced, every category off. */
export function makePreferences(overrides: Partial<Preferences> = {}): Preferences {
  const off = { enabled: false };
  const reminder = { enabled: false, time: null };
  return {
    theme: 'system',
    sound: true,
    haptics: true,
    reducedMotion: false,
    notifications: {
      dailyGoalReminder: reminder,
      scheduledFocusReminder: reminder,
      streakReminder: reminder,
      eventStart: off,
      eventEndingSoon: off,
      friendInvite: off,
      focusRoomInvite: off,
      challengeUpdate: off,
      badgeUnlocked: off,
      monthlyRecapReady: off,
    },
    ...overrides,
  };
}
