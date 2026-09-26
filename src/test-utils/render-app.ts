import { renderRouter } from 'expo-router/testing-library';

/**
 * renderRouter with real timers afterwards. renderRouter turns on fake timers to render the
 * first route synchronously and leaves them on; the app's flows run on real promises and
 * TanStack Query notifies through setTimeout, so waiting on fake timers made tests slow and
 * flaky under load.
 */
export function renderApp(...args: Parameters<typeof renderRouter>) {
  const result = renderRouter(...args);
  jest.useRealTimers();
  return result;
}
