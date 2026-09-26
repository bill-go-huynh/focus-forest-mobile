import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';

import { Button } from './Button';
import { Overlay } from './Overlay';

/**
 * Bottom sheet (docs/01_DESIGN_SYSTEM.md §8): pickers, quick edits, and confirmations.
 * Opened and closed by the parent through `visible`.
 */
export interface SheetProps {
  visible: boolean;
  /** Called by the close button, back, escape, and the backdrop. */
  onRequestClose: () => void;
  /** The heading and the sheet's accessible name. */
  title: string;
  /** Label of the close button (default "Close"). */
  closeLabel?: string;
  dismissOnBackdropPress?: boolean;
  /** The control that opened the sheet; screen-reader focus returns to it on close. */
  returnFocusRef?: RefObject<View | null>;
  children: ReactNode;
}

export function Sheet({ closeLabel = 'Close', onRequestClose, children, ...rest }: SheetProps) {
  return (
    <Overlay
      presentation="sheet"
      onRequestClose={onRequestClose}
      headerAction={<Button variant="tertiary" label={closeLabel} onPress={onRequestClose} />}
      {...rest}
    >
      {children}
    </Overlay>
  );
}
