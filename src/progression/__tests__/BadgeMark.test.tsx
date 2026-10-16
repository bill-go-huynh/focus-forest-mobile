import { screen } from '@testing-library/react-native';
import { Circle, Path } from 'react-native-svg';

import { renderWithProviders } from '../../test-utils/render';
import { badgeArtStatus, BadgeMark } from '../BadgeMark';

const hidden = { includeHiddenElements: true } as const;

describe('BadgeMark (ART.2)', () => {
  it('draws the frame and the emblem, hidden from screen readers', () => {
    renderWithProviders(
      <BadgeMark badge={{ artworkId: 'early-bird', category: 'time_based', rarity: 'common' }} />,
    );
    const mark = screen.getByTestId('badge-mark-early-bird', hidden);
    expect(mark.props.accessibilityElementsHidden).toBe(true);
    expect(screen.UNSAFE_root.findAll((n) => n.type === Path).length).toBeGreaterThan(3);
  });

  it('gives a legendary badge a soft glow behind it', () => {
    renderWithProviders(
      <BadgeMark
        badge={{ artworkId: 'focus-hours-500', category: 'focus', rarity: 'legendary' }}
        size="reveal"
      />,
    );
    expect(screen.getByTestId('badge-halo', hidden)).toBeTruthy();
  });

  it('is provisional art until the owner passes the quality gate', () => {
    expect(badgeArtStatus).toBe('provisional');
    renderWithProviders(
      <BadgeMark badge={{ artworkId: 'first-session', category: 'focus', rarity: 'common' }} />,
    );
    expect(screen.queryByTestId('badge-halo', hidden)).toBeNull();
    expect(screen.UNSAFE_root.findAll((n) => n.type === Circle).length).toBe(0);
  });
});
