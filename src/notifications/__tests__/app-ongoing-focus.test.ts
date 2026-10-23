import { requireOptionalNativeModule } from 'expo';

import { memoryStorage } from '../../test-utils/storage';
import { ActiveTimerStore } from '../../timer/active-timer-store';
import { createAppOngoingFocus, ONGOING_FOCUS_URL, refreshWhenLeaving } from '../app-ongoing-focus';

jest.mock('expo', () => ({
  ...jest.requireActual<object>('expo'),
  requireOptionalNativeModule: jest.fn(),
}));

const T0 = Date.parse('2026-10-22T08:00:00.000Z');
const loader = requireOptionalNativeModule as jest.Mock;

async function runningTimer() {
  const timers = new ActiveTimerStore({
    storage: memoryStorage(),
    now: () => T0,
    createId: () => '0192f1a2-3b4c-7d5e-8f60-718293000001',
    report: () => undefined,
  });
  await timers.activate('11111111-1111-4111-8111-111111111111');
  return timers;
}

describe('the app’s ongoing focus notification', () => {
  beforeEach(() => loader.mockReset());

  it('posts through the local native module, opening the Focus screen', async () => {
    const native = { show: jest.fn(), hide: jest.fn() };
    loader.mockReturnValue(native);
    const timers = await runningTimer();
    createAppOngoingFocus(timers).start();
    await timers.start({
      topicId: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
      plannedMinutes: 25,
      rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
    });
    expect(loader).toHaveBeenCalledWith('FocusOngoingNotification');
    expect(native.show).toHaveBeenCalledWith(
      'Focusing',
      expect.any(String),
      T0 + 25 * 60_000,
      T0 + 25 * 60_000,
      'focusforest:///focus',
    );
    expect(ONGOING_FOCUS_URL).toBe('focusforest:///focus');
  });

  it('shows nothing and never fails in a build without the module', async () => {
    loader.mockReturnValue(null);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const timers = await runningTimer();
    createAppOngoingFocus(timers).start();
    await timers.start({
      topicId: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
      plannedMinutes: 25,
      rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
    });
    expect(timers.getSnapshot().timer).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ignores a module that does not have the expected functions', async () => {
    loader.mockReturnValue({});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const timers = await runningTimer();
    createAppOngoingFocus(timers).start();
    await timers.start({
      topicId: '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f',
      plannedMinutes: 25,
      rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('leaving the app posts the countdown again', () => {
  it('refreshes on background and inactive, never on active, and stops when asked', () => {
    let listener: ((state: string) => void) | null = null;
    const remove = jest.fn();
    const appState = {
      addEventListener: (_: 'change', l: (state: string) => void) => {
        listener = l;
        return { remove };
      },
    };
    const ongoing = { refresh: jest.fn() };
    const stop = refreshWhenLeaving(appState, ongoing);
    listener!('active');
    expect(ongoing.refresh).not.toHaveBeenCalled();
    // The permission asked at the session's start is answered by then (Android 13).
    listener!('background');
    listener!('inactive');
    expect(ongoing.refresh).toHaveBeenCalledTimes(2);
    stop();
    expect(remove).toHaveBeenCalled();
  });
});
