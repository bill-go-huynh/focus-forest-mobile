import type { RefObject } from 'react';
import { View, type View as ViewType } from 'react-native';

import { MIN_TOUCH_TARGET } from '../accessibility';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Overlay, OverlayMessage, type OverlayPresentation } from './Overlay';
import { ButtonLabel, PressableSurface, requireText, textButtonLayout } from './PressableSurface';

/**
 * The confirmation step (docs/01 §8: destructive actions are always confirmed). Pair it
 * with DestructiveButton: its onRequestConfirm opens this, and the action itself runs in
 * onConfirm. Back, escape, and the backdrop all count as cancel.
 */
export interface ConfirmationProps {
  visible: boolean;
  /** The question, such as "Delete this item?". */
  title: string;
  /** The consequence, in plain and kind language. */
  message?: string;
  confirmLabel: string;
  /** Default "Cancel". */
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Sheet by default (docs/01: sheets for confirmations); modal for rare interruptions. */
  presentation?: OverlayPresentation;
  returnFocusRef?: RefObject<ViewType | null>;
}

export function Confirmation({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
  presentation = 'sheet',
  returnFocusRef,
}: ConfirmationProps) {
  const theme = useTheme();
  requireText(confirmLabel, 'confirmLabel', 'Confirmation');
  requireText(cancelLabel, 'cancelLabel', 'Confirmation');

  return (
    <Overlay
      visible={visible}
      title={title}
      presentation={presentation}
      onRequestClose={onCancel}
      returnFocusRef={returnFocusRef}
    >
      {message ? <OverlayMessage text={message} /> : null}
      <View style={{ gap: theme.space[3] }}>
        {destructive ? (
          // The final step of a destructive flow: it runs the action, so it has no
          // "asks you to confirm" hint, and it is not exported for use elsewhere.
          <PressableSurface
            accessibilityLabel={confirmLabel}
            onPress={onConfirm}
            layout={textButtonLayout(theme, MIN_TOUCH_TARGET)}
            fill={{ rest: theme.colors.surface.sunken, pressed: theme.colors.background.secondary }}
          >
            <ButtonLabel text={confirmLabel} color={theme.colors.danger} />
          </PressableSurface>
        ) : (
          <Button variant="primary" label={confirmLabel} onPress={onConfirm} />
        )}
        <Button variant="secondary" label={cancelLabel} onPress={onCancel} />
      </View>
    </Overlay>
  );
}
