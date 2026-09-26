import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';

const ReducedMotionContext = createContext<boolean | null>(null);
const SystemReducedMotionContext = createContext<boolean | null>(null);

/**
 * Tracks the system reduce-motion setting and combines it with the in-app setting.
 * Motion is reduced when either one is on (docs/04_ANIMATION_SYSTEM.md §8).
 *
 * `appReducedMotion` is the in-app "Reduce motion" preference (A5 `reducedMotion`),
 * connected from the API preferences in the root layout.
 */
export function AccessibilityProvider({
  appReducedMotion = false,
  children,
}: {
  appReducedMotion?: boolean;
  children: ReactNode;
}) {
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);

  useEffect(() => {
    let changedByEvent = false;
    let active = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      changedByEvent = true;
      setSystemReducedMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      // A change event is newer than the initial query, so it wins.
      if (active && !changedByEvent) setSystemReducedMotion(enabled);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return (
    <SystemReducedMotionContext.Provider value={systemReducedMotion}>
      <ReducedMotionContext.Provider value={systemReducedMotion || appReducedMotion}>
        {children}
      </ReducedMotionContext.Provider>
    </SystemReducedMotionContext.Provider>
  );
}

/** True when motion should be reduced: cross-fades instead of movement, no ambient motion. */
export function useReducedMotion(): boolean {
  const reduced = useContext(ReducedMotionContext);
  if (reduced === null) {
    throw new Error('useReducedMotion must be used inside an AccessibilityProvider.');
  }
  return reduced;
}

/** The device's own reduce-motion setting, for explaining it in Settings. */
export function useSystemReducedMotion(): boolean {
  const reduced = useContext(SystemReducedMotionContext);
  if (reduced === null) {
    throw new Error('useSystemReducedMotion must be used inside an AccessibilityProvider.');
  }
  return reduced;
}
