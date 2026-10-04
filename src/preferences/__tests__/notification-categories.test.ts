import {
  CURRENT_PHASE,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_PHASE,
  visibleNotificationCategories,
} from '../notification-categories';

describe('notification categories shown in Settings (docs/12: each phase adds its own)', () => {
  it('knows every A5 category, in spec order', () => {
    expect(NOTIFICATION_CATEGORIES).toEqual([
      'dailyGoalReminder',
      'scheduledFocusReminder',
      'streakReminder',
      'eventStart',
      'eventEndingSoon',
      'friendInvite',
      'focusRoomInvite',
      'challengeUpdate',
      'badgeUnlocked',
      'monthlyRecapReady',
    ]);
    expect(Object.keys(NOTIFICATION_CATEGORY_PHASE).sort()).toEqual(
      [...NOTIFICATION_CATEGORIES].sort(),
    );
  });

  it('ties each category to the phase that builds its feature', () => {
    expect(NOTIFICATION_CATEGORY_PHASE).toEqual({
      // Reminders are Phase 18 (Notifications; macro Phase 6), not the phases that build
      // focus sessions (2) or goals and streaks (4, the Core Loop, M3.3).
      scheduledFocusReminder: 18,
      dailyGoalReminder: 18,
      streakReminder: 18,
      monthlyRecapReady: 7,
      badgeUnlocked: 8,
      friendInvite: 11,
      focusRoomInvite: 12,
      challengeUpdate: 13,
      eventStart: 14,
      eventEndingSoon: 14,
    });
  });

  it('shows no category in Phase 1: none of their features exist yet', () => {
    expect(CURRENT_PHASE).toBe(1);
    expect(visibleNotificationCategories()).toEqual([]);
  });

  it('never offers the scheduled focus reminder in Phase 2, nor before Phase 18', () => {
    expect(visibleNotificationCategories(2)).toEqual([]);
    expect(visibleNotificationCategories(17)).not.toContain('scheduledFocusReminder');
    expect(visibleNotificationCategories(18)).toContain('scheduledFocusReminder');
  });

  it('never offers daily goal or streak reminders with the Core Loop (goals and streaks)', () => {
    for (const phase of [4, 7, 17]) {
      expect(visibleNotificationCategories(phase)).not.toContain('dailyGoalReminder');
      expect(visibleNotificationCategories(phase)).not.toContain('streakReminder');
    }
    expect(visibleNotificationCategories(18)).toEqual(
      expect.arrayContaining(['dailyGoalReminder', 'streakReminder', 'scheduledFocusReminder']),
    );
  });

  it('adds categories as their phases arrive, keeping spec order', () => {
    expect(visibleNotificationCategories(4)).toEqual([]);
    expect(visibleNotificationCategories(7)).toEqual(['monthlyRecapReady']);
    expect(visibleNotificationCategories(20)).toEqual(NOTIFICATION_CATEGORIES);
  });
});
