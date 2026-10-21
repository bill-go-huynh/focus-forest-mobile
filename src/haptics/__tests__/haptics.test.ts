import { Platform } from 'react-native';

import { playHaptic } from '../haptics';

/** docs/04 §9: one soft signal at completion, a richer one at a milestone, a tick on pickers. */
const haptics = () =>
  jest.requireMock<
    Record<
      'impactAsync' | 'notificationAsync' | 'selectionAsync' | 'performAndroidHapticsAsync',
      jest.Mock
    >
  >('expo-haptics');
const os = Platform.OS;
afterEach(() => {
  Platform.OS = os;
});

describe('playHaptic', () => {
  it('uses the iOS feedback generators', () => {
    Platform.OS = 'ios';
    playHaptic('complete');
    playHaptic('milestone');
    playHaptic('select');
    expect(haptics().impactAsync).toHaveBeenCalledWith('soft');
    expect(haptics().notificationAsync).toHaveBeenCalledWith('success');
    expect(haptics().selectionAsync).toHaveBeenCalledTimes(1);
    expect(haptics().performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it('uses the view’s haptic feedback on Android, so the system setting applies', () => {
    Platform.OS = 'android';
    playHaptic('complete');
    playHaptic('milestone');
    playHaptic('select');
    expect(haptics().performAndroidHapticsAsync.mock.calls).toEqual([
      ['confirm'],
      ['long-press'],
      ['segment-tick'],
    ]);
    expect(haptics().impactAsync).not.toHaveBeenCalled();
  });

  it('never throws on a device without haptics', async () => {
    Platform.OS = 'ios';
    haptics().impactAsync.mockRejectedValue(new Error('no vibrator'));
    expect(() => playHaptic('complete')).not.toThrow();
    haptics().selectionAsync.mockImplementation(() => {
      throw new Error('no module');
    });
    expect(() => playHaptic('select')).not.toThrow();
    await Promise.resolve();
  });
});
