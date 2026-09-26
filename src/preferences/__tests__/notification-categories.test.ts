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
      scheduledFocusReminder: 2,
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

  it('adds categories as their phases arrive, keeping spec order', () => {
    expect(visibleNotificationCategories(4)).toEqual([
      'dailyGoalReminder',
      'scheduledFocusReminder',
      'streakReminder',
    ]);
    expect(visibleNotificationCategories(20)).toEqual(NOTIFICATION_CATEGORIES);
  });
});
