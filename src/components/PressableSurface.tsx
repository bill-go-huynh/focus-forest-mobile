import { useState, type ReactNode, type Ref } from 'react';
import { Animated, Easing, Pressable, Text, type View, type ViewStyle } from 'react-native';

import { MIN_TOUCH_TARGET, useReducedMotion } from '../accessibility';
import { useTheme, type Theme } from '../theme';

/**
 * The shared press behavior of every tappable primitive: one accessible button, a slight
 * tonal shift and scale while pressed (docs/01 §8, docs/04 §2), and a disabled state that
 * cannot be pressed. Internal to src/components.
 */

export interface FillColors {
  rest?: string;
  pressed: string;
}

export interface PressableSurfaceProps {
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  /** Read to screen readers when disabled, where the reason isn't obvious. */
  disabledReason?: string;
  /** Set for toggles such as chips, so screen readers announce the selection. */
  selected?: boolean;
  onPress: () => void;
  layout: ViewStyle;
  fill: FillColors;
  testID?: string;
  /** Reaches the pressable, so an overlay can return focus to it. */
  ref?: Ref<View>;
  children: ReactNode;
}

export function PressableSurface({
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  disabledReason,
  selected,
  onPress,
  layout,
  fill,
  testID,
  ref,
  children,
}: PressableSurfaceProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);

  // Under reduced motion only the tonal shift remains (docs/04_ANIMATION_SYSTEM.md §8).
  const animateScale = (toValue: number) => {
    if (reducedMotion) return;
    Animated.timing(scale, {
      toValue,
      duration: theme.motion.fast,
      easing: Easing.bezier(...theme.easing.standard),
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        ref={ref}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={disabled && disabledReason ? disabledReason : accessibilityHint}
        accessibilityState={selected === undefined ? { disabled } : { disabled, selected }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          setPressed(true);
          animateScale(theme.interaction.pressedScale);
        }}
        onPressOut={() => {
          setPressed(false);
          animateScale(1);
        }}
        testID={testID}
        style={[
          layout,
          { backgroundColor: pressed ? fill.pressed : fill.rest },
          disabled && { opacity: theme.opacity.disabled },
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** Throws when an accessible name is missing: without it, a control has no name to read. */
export function requireText(value: string | undefined, name: string, component: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`${component} needs a non-empty ${name}: it is the accessible name.`);
  }
  return value;
}

/** Draws an icon with the color and size its component provides. */
export type IconRenderer = (props: { color: string; size: number }) => ReactNode;

/** The pill layout shared by every text button, including the final confirm button. */
export function textButtonLayout(theme: Theme, minHeight: number): ViewStyle {
  return {
    minHeight,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: theme.space[5],
    paddingVertical: theme.space[3],
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  };
}

export function ButtonLabel({ text, color }: { text: string; color: string }) {
  const theme = useTheme();
  // No numberOfLines: long labels wrap at large text sizes instead of truncating.
  return <Text style={[theme.type.label, { color, textAlign: 'center' }]}>{text}</Text>;
}
