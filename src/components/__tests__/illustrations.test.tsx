import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { renderWithProviders } from '../../test-utils/render';
import { darkTheme, lightTheme, type Theme } from '../../theme';
import { ILLUSTRATION_IDS, illustrationStatus, SpotIllustration } from '../illustrations';

const mockColorScheme = jest.fn<'light' | 'dark', []>(() => 'light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

const themes = [
  ['light', lightTheme],
  ['dark', darkTheme],
] as const satisfies readonly (readonly ['light' | 'dark', Theme])[];

beforeEach(() => mockColorScheme.mockReturnValue('light'));

// Every fill and stroke color; "none" is the absence of paint, not a color.
const shapeFills = () =>
  screen.UNSAFE_root.findAll((node) => [Circle, Ellipse, Path, Rect].includes(node.type as never))
    .flatMap((node) => [node.props.fill, node.props.stroke] as (string | undefined)[])
    .filter((color): color is string => color !== undefined && color !== 'none');

describe('spot illustrations (docs/10 §2 → UI illustrations)', () => {
  it('uses the documented spot illustrations of the same world', () => {
    expect([...ILLUSTRATION_IDS].sort()).toEqual(['clearing', 'lantern', 'seed-in-soil']);
  });

  it('marks every illustration as a provisional placeholder, not final art (docs/10 §4)', () => {
    for (const id of ILLUSTRATION_IDS) {
      expect(illustrationStatus[id]).toBe('placeholder');
    }
  });

  it('has no dying, wilting, or failure imagery among its identifiers', () => {
    for (const id of ILLUSTRATION_IDS) {
      expect(id).not.toMatch(/dead|die|wilt|wither|fail|broken|sad|cry/);
    }
  });

  it.each(ILLUSTRATION_IDS)('draws %s at the spot size and hides it from screen readers', (id) => {
    renderWithProviders(<SpotIllustration id={id} />);
    expect(screen.queryByTestId(`illustration-${id}`)).toBeNull();
    const art = screen.getByTestId(`illustration-${id}`, { includeHiddenElements: true });
    expect(StyleSheet.flatten(art.props.style)).toMatchObject({
      width: lightTheme.illustration.spot,
      height: lightTheme.illustration.spot,
    });
    expect(art.props.accessibilityElementsHidden).toBe(true);
    expect(art.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  describe.each(themes)('colors in the %s theme', (scheme, theme) => {
    beforeEach(() => mockColorScheme.mockReturnValue(scheme));

    it.each(ILLUSTRATION_IDS)('%s is drawn only with theme colors, never danger', (id) => {
      renderWithProviders(<SpotIllustration id={id} />);
      const allowed = new Set(
        Object.values(theme.colors).flatMap((value) =>
          typeof value === 'string' ? [value] : Object.values(value),
        ),
      );
      const fills = shapeFills();
      expect(fills.length).toBeGreaterThan(0);
      for (const fill of fills) {
        expect(allowed.has(fill)).toBe(true);
        expect(fill).not.toBe(theme.colors.danger);
      }
    });
  });

  it('can be drawn smaller', () => {
    renderWithProviders(<SpotIllustration id="clearing" size={lightTheme.illustration.spot / 2} />);
    const svg = screen.getByTestId('illustration-clearing', { includeHiddenElements: true });
    expect(StyleSheet.flatten(svg.props.style)).toMatchObject({
      width: lightTheme.illustration.spot / 2,
      height: lightTheme.illustration.spot / 2,
    });
  });
});
