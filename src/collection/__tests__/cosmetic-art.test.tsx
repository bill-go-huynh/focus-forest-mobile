import { screen } from '@testing-library/react-native';
import { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { renderWithProviders } from '../../test-utils/render';
import { CosmeticMark, cosmeticArtStatus } from '../CollectionArt';

/**
 * ART.5 Cosmetic marks in direction B: each a small lit vignette of what the cosmetic adds
 * (docs/03 §7 layers 2 and 17; docs/10 → Profile frames: a subtle ring that echoes the nature
 * motifs). An unknown cosmetic draws the plain vignette instead of failing.
 */

const hidden = { includeHiddenElements: true } as const;
const shapes = () =>
  screen.UNSAFE_root.findAll((n) => [Circle, Ellipse, Path, Rect].includes(n.type as never));
const lit = () => shapes().filter((n) => String(n.props.fill).startsWith('url(#'));

describe('cosmetic marks (ART.5)', () => {
  it.each([
    ['misty-hills', 'background'],
    ['meadow', 'background'],
    ['stone-lantern', 'decoration'],
    ['mossy-stones', 'decoration'],
    ['twig-frame', 'profile_frame'],
  ])('draws %s as a lit vignette', (id, type) => {
    renderWithProviders(<CosmeticMark id={id} type={type} />);
    expect(screen.getByTestId(`cosmetic-mark-${id}`, hidden)).toBeTruthy();
    expect(lit().length).toBeGreaterThan(0);
  });

  it('gives the profile frame a vine with leaves, not a plain ring', () => {
    renderWithProviders(<CosmeticMark id="twig-frame" type="profile_frame" />);
    expect(shapes().length).toBeGreaterThanOrEqual(5);
  });

  it('draws an unknown cosmetic as the plain vignette', () => {
    renderWithProviders(<CosmeticMark id="a-future-item" type="a-future-type" />);
    expect(shapes().length).toBeGreaterThan(0);
  });

  it('is provisional until the owner passes the quality gate', () => {
    expect(cosmeticArtStatus).toBe('provisional');
  });
});
