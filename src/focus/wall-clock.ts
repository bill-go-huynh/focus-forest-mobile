import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** docs/04 §9: the countdown updates once per second. */
export const TICK_MILLISECONDS = 1000;

/**
 * The wall clock for a view: `now()` read about once a second while the app is in the
 * foreground, and again the moment it returns. A tick only reads the clock again; nothing is
 * counted, so a late or missed tick shows the right time the next time it runs. Nothing ticks
 * in the background.
 */
export function useWallClock(now: () => number): number {
  const [reading, setReading] = useState(now);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const read = () => setReading(now());
    const run = () => {
      interval ??= setInterval(read, TICK_MILLISECONDS);
    };
    const stop = () => {
      if (interval !== null) clearInterval(interval);
      interval = null;
    };
    run();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        read();
        run();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [now]);

  return reading;
}
