import { act } from '@testing-library/react-native';

import { lightTheme } from '../theme';

/**
 * Route tests with sheets. A sheet leaves only when its exit transition ends, and the native
 * animation mock ends it on a real timer. Waiting for it with findBy or waitFor polling can
 * starve that timer or let its last update land outside act, so these wait in real time,
 * inside act. Production animation is unchanged.
 */

/** Waits until the condition holds (at most 10 s): after an action that closes a sheet. */
export async function until(condition: () => boolean, timeout = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the condition.');
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
  }
}

/** For afterEach: lets a sheet closed at the end of a test finish its exit inside act. */
export function settleSheetTransitions(): Promise<void> {
  return act(() => new Promise<void>((resolve) => setTimeout(resolve, lightTheme.motion.base * 2)));
}
