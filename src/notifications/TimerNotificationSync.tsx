import { useEffect } from 'react';

import { useSession } from '../api';
import { usePreferences } from '../preferences/queries';
import type { TimerNotificationCoordinator } from './timer-notifications';

/**
 * Starts the timer notifications following the timer store, and gives them the user's sound
 * preference (A5 default: on, until the preferences are known). Renders nothing. Place it
 * inside `ActiveTimerProvider`, which also calls `coordinator.reconcile()` after its foreground
 * refresh.
 */
export function TimerNotificationSync({
  coordinator,
}: {
  coordinator: TimerNotificationCoordinator;
}) {
  const { status } = useSession();
  const preferences = usePreferences({ enabled: status === 'authenticated' });
  const sound = preferences.data?.sound ?? true;

  useEffect(() => coordinator.start(), [coordinator]);

  useEffect(() => {
    void coordinator.setSound(sound);
  }, [coordinator, sound]);

  return null;
}
