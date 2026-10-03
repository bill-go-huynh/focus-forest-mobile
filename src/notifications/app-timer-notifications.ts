import type { ActiveTimerStore } from '../timer/active-timer-store';
import { createOsTimerNotificationAdapter } from './os-timer-notifications';
import { TimerNotificationCoordinator } from './timer-notifications';

/** The app's timer notifications, on the OS (none in Expo Go on Android). Issues are reported by code only. */
export function createAppTimerNotifications(
  timers: ActiveTimerStore,
): TimerNotificationCoordinator {
  return new TimerNotificationCoordinator({
    timers,
    adapter: createOsTimerNotificationAdapter(),
    report: (issue) => console.warn(`[notifications] timer notification: ${issue.code}`),
  });
}
