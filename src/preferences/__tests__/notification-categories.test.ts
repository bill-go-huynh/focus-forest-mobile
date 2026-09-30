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
      // Reminders about focus are Phase 18 (Notifications), not Phase 2 (focus sessions).
      scheduledFocusReminder: 18,
      dailyGoalReminder: 4,
      streakReminder: 4,
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

  it('adds categories as their phases arrive, keeping spec order', () => {
    expect(visibleNotificationCategories(4)).toEqual(['dailyGoalReminder', 'streakReminder']);
    expect(visibleNotificationCategories(20)).toEqual(NOTIFICATION_CATEGORIES);
  });
});
