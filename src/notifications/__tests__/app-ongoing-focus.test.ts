import { requireOptionalNativeModule } from 'expo';

import { memoryStorage } from '../../test-utils/storage';
import { ActiveTimerStore } from '../../timer/active-timer-store';
import { createAppOngoingFocus, ONGOING_FOCUS_URL } from '../app-ongoing-focus';

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
