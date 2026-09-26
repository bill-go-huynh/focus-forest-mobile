import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';

import { Overlay, OverlayMessage } from './Overlay';

/**
 * Centered modal (docs/01_DESIGN_SYSTEM.md §8), only for rare, important interruptions
 * such as "End session early?". Prefer a Sheet otherwise. Its actions (children) are the
 * way out; back, escape, and the backdrop also ask to close.
 */
export interface ModalProps {
  visible: boolean;
  onRequestClose: () => void;
  /** The heading and the modal's accessible name. */
  title: string;
  /** One supporting sentence under the title. */
  message?: string;
  dismissOnBackdropPress?: boolean;
  /** The control that opened the modal; screen-reader focus returns to it on close. */
  returnFocusRef?: RefObject<View | null>;
  /** The actions. */
  children: ReactNode;
}

export function Modal({ message, children, ...rest }: ModalProps) {
  return (
    <Overlay presentation="modal" {...rest}>
      {message ? <OverlayMessage text={message} /> : null}
      {children}
    </Overlay>
  );
}
