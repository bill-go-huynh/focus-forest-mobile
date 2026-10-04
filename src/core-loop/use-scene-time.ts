import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { timeOfDayAt, type TimeOfDay } from '../tree';
import { sceneClock } from './scene-clock';

/**
 * The tree scene's lighting preset from this device's local time (docs/03 §10), read again when
 * the app returns to the foreground and when the screen is shown again. Presentation only: the
 * tree's state never changes with it, and it is never sent to the server.
 */
export function useSceneTimeOfDay(): TimeOfDay {
  const read = () => timeOfDayAt(new Date(sceneClock.now()));
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(read);
  const refresh = useCallback(() => setTimeOfDay(timeOfDayAt(new Date(sceneClock.now()))), []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  useFocusEffect(refresh);
  return timeOfDay;
}
