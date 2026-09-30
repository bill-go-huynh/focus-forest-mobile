import type { NotificationCategory } from '../api';

/**
 * Which notification categories Settings offers. A5 stores all ten (spec §18), but a
 * category is shown only once its feature exists: docs/12 says Phase 1 builds the
 * preference structure and every later phase adds its categories. Delivery is Phase 18.
 */
export const CURRENT_PHASE = 1;

export const NOTIFICATION_CATEGORIES = [
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
] as const satisfies readonly NotificationCategory[];

/** The phase that builds each category's feature (docs/12_PRODUCT_IMPLEMENTATION_PLAN.md). */
export const NOTIFICATION_CATEGORY_PHASE: Record<NotificationCategory, number> = {
  dailyGoalReminder: 4, // goals
  streakReminder: 4, // streaks
  monthlyRecapReady: 7, // monthly recap
  badgeUnlocked: 8, // achievements and badges
  friendInvite: 11, // social
  focusRoomInvite: 12, // Focus Together
  challengeUpdate: 13, // challenges
  eventStart: 14, // events
  eventEndingSoon: 14,
  scheduledFocusReminder: 18, // Notifications: goal and focus reminders
};

export function visibleNotificationCategories(phase = CURRENT_PHASE): NotificationCategory[] {
  return NOTIFICATION_CATEGORIES.filter(
    (category) => NOTIFICATION_CATEGORY_PHASE[category] <= phase,
  );
}
