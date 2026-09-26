import { renderHook } from '@testing-library/react-native';

import { useFontScale } from '../font-scale';

const mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

function mockFontScale(fontScale: number) {
  mockWindow.fontScale = fontScale;
}

describe('useFontScale (docs/11: text follows the system size, up to 200%)', () => {
  it.each([1, 1.35, 2, 3.1])('reports the system font scale %s', (scale) => {
    mockFontScale(scale);
    const { result } = renderHook(() => useFontScale());
    expect(result.current.fontScale).toBe(scale);
  });

  it('scales a size by the system font scale', () => {
    mockFontScale(2);
    const { result } = renderHook(() => useFontScale());
    expect(result.current.scaled(16)).toBe(32);
  });

  it('flags text at or above 200% so layouts can adapt instead of truncating', () => {
    mockFontScale(1.99);
    expect(renderHook(() => useFontScale()).result.current.isLargeText).toBe(false);
    mockFontScale(2);
    expect(renderHook(() => useFontScale()).result.current.isLargeText).toBe(true);
  });
});
