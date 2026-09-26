import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import {
  AccessibilityProvider,
  useReducedMotion,
  useSystemReducedMotion,
} from '../AccessibilityProvider';

type Listener = (enabled: boolean) => void;

function mockSystemReduceMotion(initial: boolean) {
  const listeners: Listener[] = [];
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(initial);
  // The mock returns only `remove`, the part the provider uses.
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    event: string,
    listener: Listener,
  ) => {
    if (event === 'reduceMotionChanged') listeners.push(listener);
    return { remove };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
  return { emit: (enabled: boolean) => listeners.forEach((l) => l(enabled)), remove };
}

function wrapperWith(appReducedMotion?: boolean) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AccessibilityProvider appReducedMotion={appReducedMotion}>{children}</AccessibilityProvider>
    );
  };
}

afterEach(() => jest.restoreAllMocks());

describe('reduced motion (docs/04 §8: system OR in-app setting)', () => {
  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])('system %s + in-app %s → reduced %s', async (system, app, expected) => {
    mockSystemReduceMotion(system);
    const { result } = renderHook(() => useReducedMotion(), { wrapper: wrapperWith(app) });
    await waitFor(() => expect(result.current).toBe(expected));
  });

  it('treats a missing in-app setting as off, so the system setting decides', async () => {
    mockSystemReduceMotion(true);
    const { result } = renderHook(() => useReducedMotion(), { wrapper: wrapperWith(undefined) });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('follows the system setting when it changes while the app runs', async () => {
    const system = mockSystemReduceMotion(false);
    const { result } = renderHook(() => useReducedMotion(), { wrapper: wrapperWith(false) });
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());

    act(() => system.emit(true));
    expect(result.current).toBe(true);

    act(() => system.emit(false));
    expect(result.current).toBe(false);
  });

  it('follows the in-app setting when it changes', async () => {
    mockSystemReduceMotion(false);
    function Probe() {
      return <Text testID="reduced">{String(useReducedMotion())}</Text>;
    }
    const { rerender } = render(
      <AccessibilityProvider appReducedMotion={false}>
        <Probe />
      </AccessibilityProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('reduced')).toHaveTextContent('false'));

    rerender(
      <AccessibilityProvider appReducedMotion>
        <Probe />
      </AccessibilityProvider>,
    );
    expect(screen.getByTestId('reduced')).toHaveTextContent('true');
  });

  it('keeps a change event that arrives before the initial query resolves', async () => {
    let resolve: (value: boolean) => void = () => undefined;
    const system = mockSystemReduceMotion(false);
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockReturnValue(new Promise<boolean>((r) => (resolve = r)));
    const { result } = renderHook(() => useReducedMotion(), { wrapper: wrapperWith(false) });

    act(() => system.emit(true));
    await act(async () => resolve(false));

    expect(result.current).toBe(true);
  });

  it('stops listening when unmounted', async () => {
    const system = mockSystemReduceMotion(false);
    const { unmount } = renderHook(() => useReducedMotion(), { wrapper: wrapperWith(false) });
    await waitFor(() => expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled());
    unmount();
    expect(system.remove).toHaveBeenCalled();
  });

  it('fails clearly outside the provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useReducedMotion())).toThrow(/AccessibilityProvider/);
  });
});

describe('useSystemReducedMotion (so Settings can say the device already reduces motion)', () => {
  it.each([true, false])(
    'reports the system setting (%s) regardless of the app setting',
    async (system) => {
      mockSystemReduceMotion(system);
      const { result } = renderHook(() => useSystemReducedMotion(), { wrapper: wrapperWith(true) });
      await waitFor(() => expect(result.current).toBe(system));
    },
  );
});
