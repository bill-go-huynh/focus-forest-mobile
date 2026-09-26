import type { Ref } from 'react';
import { View } from 'react-native';

import { MIN_TOUCH_TARGET } from '../accessibility';
import { useTheme } from '../theme';
import {
  ButtonLabel as Label,
  PressableSurface as BaseButton,
  requireText,
  textButtonLayout,
  type IconRenderer,
} from './PressableSurface';

/** Button primitives (docs/01_DESIGN_SYSTEM.md §8 → Buttons). */

export interface ButtonProps {
  /** primary: one per screen at most. secondary: alternative actions. tertiary: low emphasis. */
  variant: 'primary' | 'secondary' | 'tertiary';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  disabledReason?: string;
  accessibilityHint?: string;
  testID?: string;
  /** Lets an overlay return focus here when it closes. */
  ref?: Ref<View>;
}

export function Button({ variant, label, ...rest }: ButtonProps) {
  const theme = useTheme();
  requireText(label, 'label', 'Button');
  const { colors } = theme;

  const styles = {
    primary: {
      fill: { rest: colors.accent.primary, pressed: colors.accent.primaryPressed },
      text: colors.text.inverse,
      minHeight: theme.control.minHeight,
    },
    secondary: {
      fill: { rest: colors.surface.sunken, pressed: colors.accent.soft },
      text: colors.text.primary,
      minHeight: MIN_TOUCH_TARGET,
    },
    tertiary: {
      fill: { pressed: colors.surface.sunken },
      text: colors.text.accent,
      minHeight: MIN_TOUCH_TARGET,
    },
  }[variant];

  return (
    <BaseButton
      accessibilityLabel={label}
      layout={textButtonLayout(theme, styles.minHeight)}
      fill={styles.fill}
      {...rest}
    >
      <Label text={label} color={styles.text} />
    </BaseButton>
  );
}

export interface IconButtonProps {
  /** Required: an icon alone has no accessible name. */
  accessibilityLabel: string;
  /** Draws the icon with the color and size the button provides. */
  icon: IconRenderer;
  onPress: () => void;
  disabled?: boolean;
  disabledReason?: string;
  accessibilityHint?: string;
  testID?: string;
  /** Lets an overlay return focus here when it closes. */
  ref?: Ref<View>;
}

export function IconButton({ accessibilityLabel, icon, ...rest }: IconButtonProps) {
  const theme = useTheme();
  requireText(accessibilityLabel, 'accessibilityLabel', 'IconButton');

  return (
    <BaseButton
      accessibilityLabel={accessibilityLabel}
      layout={{
        minWidth: MIN_TOUCH_TARGET,
        minHeight: MIN_TOUCH_TARGET,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      fill={{ pressed: theme.colors.surface.sunken }}
      {...rest}
    >
      {/* The label describes the button; the icon itself is decorative. */}
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {icon({ color: theme.colors.text.primary, size: theme.icon.md })}
      </View>
    </BaseButton>
  );
}

export interface DestructiveButtonProps {
  label: string;
  /**
   * Called on press. It must open a confirmation (docs/01 §8: destructive actions are
   * always confirmed); the destructive action itself runs only after the user confirms.
   */
  onRequestConfirm: () => void;
  disabled?: boolean;
  disabledReason?: string;
  testID?: string;
  ref?: Ref<View>;
}

const CONFIRM_HINT = 'Asks you to confirm before anything changes.';

export function DestructiveButton({
  label,
  onRequestConfirm,
  disabled,
  disabledReason,
  testID,
  ref,
}: DestructiveButtonProps) {
  const theme = useTheme();
  requireText(label, 'label', 'DestructiveButton');

  return (
    <BaseButton
      accessibilityLabel={label}
      accessibilityHint={CONFIRM_HINT}
      // Only these props are forwarded, so no onPress can bypass the confirmation.
      onPress={onRequestConfirm}
      disabled={disabled}
      disabledReason={disabledReason}
      testID={testID}
      ref={ref}
      layout={textButtonLayout(theme, MIN_TOUCH_TARGET)}
      fill={{ rest: theme.colors.surface.sunken, pressed: theme.colors.background.secondary }}
    >
      <Label text={label} color={theme.colors.danger} />
    </BaseButton>
  );
}
