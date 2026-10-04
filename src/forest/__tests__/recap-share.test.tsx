import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { archivedStats, makeRecap, NOTE_TEXT } from '../../test-utils/forest';
import { createNodeMock, renderWithProviders } from '../../test-utils/render';
import { RecapSharePage } from '../RecapSharePage';
import { recapShareContent } from '../recap-format';

const TOPIC_ID = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';
const recap = makeRecap();
const share = () => fireEvent.press(screen.getByRole('button', { name: 'Share' }));

afterEach(() => jest.restoreAllMocks());

describe('recap share card (M3.4)', () => {
  it('shows only the shareable fields: month, tree, stage, focus, active days, streak', () => {
    renderWithProviders(<RecapSharePage recap={recap} />);
    const card = screen.getByTestId('recap-share-card');
    expect(card).toHaveTextContent(/September 2026/);
    expect(card).toHaveTextContent(/Mature Tree/);
    expect(card).toHaveTextContent(/25 h 10 min of focus/);
    expect(card).toHaveTextContent(/19 active days/);
    expect(card).toHaveTextContent(/Longest streak: 9 days/);
    expect(card).not.toHaveTextContent(new RegExp(NOTE_TEXT));
    expect(card).not.toHaveTextContent(/Reading/);
    expect(JSON.stringify(recapShareContent(recap))).not.toMatch(
      new RegExp(`${NOTE_TEXT}|${TOPIC_ID}|${recap.highlightedNotes[0]!.sessionId}`),
    );
  });

  it('captures the card itself and shares its image through the share sheet', async () => {
    renderWithProviders(<RecapSharePage recap={recap} />, { createNodeMock });
    share();
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
    const [target, options] = jest.mocked(captureRef).mock.calls[0]!;
    expect((target as { current: { props: { testID: string } } }).current.props.testID).toBe(
      'recap-share-card',
    );
    expect(options).toMatchObject({ format: 'png', result: 'tmpfile' });
    expect(jest.mocked(Sharing.shareAsync).mock.calls[0]).toEqual([
      'file:///tmp/recap-card.png',
      expect.objectContaining({ mimeType: 'image/png' }),
    ]);
  });

  it('falls back to sharing the card’s words when file sharing is unavailable', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
    const text = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    renderWithProviders(<RecapSharePage recap={recap} />, { createNodeMock });
    share();
    await waitFor(() => expect(text).toHaveBeenCalledTimes(1));
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    const { message } = text.mock.calls[0]![0] as { message: string };
    expect(message).toContain('September 2026');
    expect(message).not.toContain(NOTE_TEXT);
  });

  it('does not crash or show internals when capture fails, and never claims an image', async () => {
    jest.mocked(captureRef).mockRejectedValue(new Error('ENOENT /private/var/tmp/xyz.png'));
    const text = jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share sheet'));
    renderWithProviders(<RecapSharePage recap={recap} />, { createNodeMock });
    share();
    expect(await screen.findByText("Sharing isn't available right now.")).toBeOnTheScreen();
    expect(text).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(screen.queryByText(/ENOENT|\/private\/|\.png/)).toBeNull();
  });

  it('shares the same card under reduced motion', async () => {
    renderWithProviders(<RecapSharePage recap={recap} />, { createNodeMock, reducedMotion: true });
    const reduced = screen.getByTestId('recap-share-card');
    expect(reduced).toHaveTextContent(/25 h 10 min of focus/);
    share();
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
  });

  it('leaves a longest streak out when the month had none', () => {
    renderWithProviders(
      <RecapSharePage recap={makeRecap({ stats: archivedStats({ longestStreak: 0 }) })} />,
    );
    expect(screen.getByTestId('recap-share-card')).not.toHaveTextContent(/Longest streak/);
  });
});
