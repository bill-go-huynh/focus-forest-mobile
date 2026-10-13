import { foregroundPresentation } from '../foreground';

/**
 * M6.1 While the app is open (docs/02: nothing during an active focus session): a push shows
 * as a banner unless someone is focusing; the timer's own notifications never show, since the
 * Focus screen shows the end itself (M2.10).
 */
describe('foregroundPresentation (M6.1)', () => {
  const shown = {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  };
  const hidden = {
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  };

  it('shows a push when nobody is focusing', () => {
    expect(foregroundPresentation({ link: '/' }, false)).toEqual(shown);
    expect(foregroundPresentation(null, false)).toEqual(shown);
  });

  it('holds everything back while focusing', () => {
    expect(foregroundPresentation({ link: '/' }, true)).toEqual(hidden);
  });

  it('never shows the timer’s own notification in the app', () => {
    expect(foregroundPresentation({ kind: 'focus-timer' }, false)).toEqual(hidden);
  });
});
