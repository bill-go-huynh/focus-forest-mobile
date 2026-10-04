import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

const isActive = (state: AppStateStatus | undefined) =>
  state !== 'background' && state !== 'inactive';

/** Whether the app is in the foreground, so ambient animation can stop in the background. */
export function useAppActive(): boolean {
  const [active, setActive] = useState(() => isActive(AppState.currentState));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(isActive(state)));
    return () => subscription.remove();
  }, []);
  return active;
}
