import type { ActiveTimerStore } from '../timer/active-timer-store';
import { createExpoTimerNotificationAdapter } from './expo-timer-notifications';
import { TimerNotificationCoordinator } from './timer-notifications';

/** The app's timer notifications, on the OS. Issues are reported by code only. */
export function createAppTimerNotifications(
  timers: ActiveTimerStore,
): TimerNotificationCoordinator {
  return new TimerNotificationCoordinator({
    timers,
    adapter: createExpoTimerNotificationAdapter(),
    report: (issue) => console.warn(`[notifications] timer notification: ${issue.code}`),
  });
}
