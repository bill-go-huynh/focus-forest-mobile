import { contrastRatio } from '../contrast';

describe('contrastRatio (WCAG 2.x)', () => {
  it('is 21:1 for black on white and 1:1 for a color on itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#7A4E0B', '#7A4E0B')).toBeCloseTo(1, 5);
  });

  it('matches known reference values', () => {
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('refuses colors it cannot measure', () => {
    expect(() => contrastRatio('#12345', '#FFFFFF')).toThrow();
    expect(() => contrastRatio('#00000080', '#FFFFFF')).toThrow(/opaque/);
  });
});
