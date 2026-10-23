import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderWithProviders } from '../../test-utils/render';
import { UnlockModal } from '../UnlockModal';
import type { UnlockMoment } from '../unlocks';

/**
 * A new badge or unlock shows in a modal the person closes (owner, 2026-10-23), not inline on
 * the screen it happened on. Closed once, the same moment never comes back.
 */
const MOMENT: UnlockMoment = {
  featured: {
    id: 'focus-hours:50',
    name: '50 Hours',
    description: '50 hours of counted focus.',
    category: 'focus',
    rarity: 'common',
    artworkId: 'focus-hours-50',
    earnedAt: '2026-10-23T08:00:00.000Z',
  },
  caption: 'You earned 50 Hours.',
  line: 'Also: Maple and Stone Lantern.',
};

describe('UnlockModal', () => {
  it('shows the badge, its words and the rest, and closes with Done', async () => {
    const { rerender } = renderWithProviders(<UnlockModal moment={MOMENT} />);
    expect(screen.getByText('You earned 50 Hours.')).toBeOnTheScreen();
    expect(screen.getByText('50 hours of counted focus.')).toBeOnTheScreen();
    expect(screen.getByText('Also: Maple and Stone Lantern.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    // The modal fades out, then is gone.
    await waitFor(() => expect(screen.queryByText('You earned 50 Hours.')).toBeNull());
    // The same moment again (a re-render) stays closed.
    rerender(<UnlockModal moment={{ ...MOMENT }} />);
    await waitFor(() => expect(screen.queryByText('You earned 50 Hours.')).toBeNull());
  });

  it('shows nothing without a moment', () => {
    renderWithProviders(<UnlockModal moment={null} />);
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('opens again for a different moment', () => {
    const { rerender } = renderWithProviders(<UnlockModal moment={MOMENT} />);
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    rerender(<UnlockModal moment={{ ...MOMENT, caption: 'You earned 7-Day Streak.' }} />);
    expect(screen.getByText('You earned 7-Day Streak.')).toBeOnTheScreen();
  });
});
