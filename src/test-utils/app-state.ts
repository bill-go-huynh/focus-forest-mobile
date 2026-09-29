import { act } from '@testing-library/react-native';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

/**
 * React Native's AppState is a bare jest mock. This keeps the app's `change` listeners so a
 * test can send the app to the background and bring it back, without a device.
 */
export function mockAppState() {
  const listeners = new Set<(state: AppStateStatus) => void>();
  jest.mocked(AppState.addEventListener).mockImplementation((type, listener) => {
    if (type === 'change') listeners.add(listener as (state: AppStateStatus) => void);
    return {
      remove: () => listeners.delete(listener as (state: AppStateStatus) => void),
    } as unknown as NativeEventSubscription;
  });
  return {
    /** Sends a change to every listener, inside act. */
    emit: (state: AppStateStatus) =>
      act(async () => {
        for (const listener of [...listeners]) listener(state);
      }),
    listeners: () => listeners.size,
  };
}
