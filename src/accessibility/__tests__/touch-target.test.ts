import { MIN_TOUCH_TARGET, touchTargetHitSlop } from '../touch-target';

describe('touch targets (docs/11: at least 44×44 pt)', () => {
  it('uses 44 pt as the minimum', () => {
    expect(MIN_TOUCH_TARGET).toBe(44);
  });

  it('extends a small control evenly on every side to reach 44×44', () => {
    expect(touchTargetHitSlop({ width: 24, height: 24 })).toEqual({
      top: 10,
      bottom: 10,
      left: 10,
      right: 10,
    });
  });

  it('adds nothing to a control that is already large enough', () => {
    expect(touchTargetHitSlop({ width: 44, height: 44 })).toEqual({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
    expect(touchTargetHitSlop({ width: 120, height: 52 })).toEqual({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
  });

  it('extends only the dimension that is too small, rounding up', () => {
    expect(touchTargetHitSlop({ width: 30, height: 60 })).toEqual({
      top: 0,
      bottom: 0,
      left: 7,
      right: 7,
    });
    expect(touchTargetHitSlop({ width: 100, height: 33 })).toEqual({
      top: 6,
      bottom: 6,
      left: 0,
      right: 0,
    });
  });

  it('always yields a hit area of at least 44 in both dimensions', () => {
    for (const width of [1, 16, 24, 31, 43.5, 44, 60]) {
      for (const height of [1, 20, 33, 44, 80]) {
        const slop = touchTargetHitSlop({ width, height });
        expect(width + slop.left + slop.right).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        expect(height + slop.top + slop.bottom).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      }
    }
  });

  it('refuses negative sizes', () => {
    expect(() => touchTargetHitSlop({ width: -1, height: 10 })).toThrow();
  });
});
