import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { RecapShareContent } from './recap-format';

export type ShareOutcome = 'image' | 'text' | 'unavailable';

/**
 * Shares a recap card (M3.4). It captures exactly the card's view to a temporary PNG (never
 * saved to the gallery, no photo permission) and opens the share sheet with it. When file
 * sharing is not available, or capture fails, it shares the card's words instead (the same
 * fields, never a note or an id); 'unavailable' when neither works. Errors and paths never reach
 * the caller. The native modules sit behind this one function.
 */
export async function shareRecapCard(
  card: RefObject<View | null>,
  content: RecapShareContent,
): Promise<ShareOutcome> {
  try {
    const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: content.title,
        UTI: 'public.png',
      });
      return 'image';
    }
  } catch {
    // Fall back to the words below.
  }
  try {
    await Share.share({
      title: content.title,
      message: [content.title, ...content.lines].join('\n'),
    });
    return 'text';
  } catch {
    return 'unavailable';
  }
}
