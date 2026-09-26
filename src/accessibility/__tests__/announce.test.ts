import { AccessibilityInfo } from 'react-native';

import { announce } from '../announce';

afterEach(() => jest.restoreAllMocks());

describe('announce (docs/11: no information only through motion or haptics)', () => {
  it('sends the message to the screen reader and returns it for the visible caption', () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();

    const caption = announce('Session complete. 25 minutes. Your tree grew.');

    expect(spy).toHaveBeenCalledWith('Session complete. 25 minutes. Your tree grew.');
    expect(caption).toBe('Session complete. 25 minutes. Your tree grew.');
  });

  it.each(['', '   '])(
    'refuses an empty message (%j), because the text is the meaning',
    (message) => {
      jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
      expect(() => announce(message)).toThrow(/text/i);
    },
  );
});
