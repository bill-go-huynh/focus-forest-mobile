import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTheme, type Theme } from '../theme';
import { PressableSurface, requireText } from './PressableSurface';

/**
 * Card primitive (docs/01_DESIGN_SYSTEM.md §8 → Cards). A card holds one idea; it is not
 * a container for unrelated numbers.
 */

interface CardBaseProps {
  children: ReactNode;
  /** elevation.1 when it sits on the background (default), or flat. */
  elevated?: boolean;
  testID?: string;
}

interface StaticCardProps extends CardBaseProps {
  onPress?: undefined;
  accessibilityLabel?: undefined;
  accessibilityHint?: undefined;
}

interface TappableCardProps extends CardBaseProps {
  onPress: () => void;
  /** Required: the whole card is read as one button with this name. */
  accessibilityLabel: string;
  accessibilityHint?: string;
}

export type CardProps = StaticCardProps | TappableCardProps;

function cardLayout(theme: Theme, elevated: boolean): ViewStyle {
  return {
    borderRadius: theme.radius.lg,
    padding: theme.space[5],
    ...theme.elevation[elevated ? 1 : 0],
  };
}

export function Card(props: CardProps) {
  const theme = useTheme();
  const { children, elevated = true, testID } = props;
  const layout = cardLayout(theme, elevated);

  if (props.onPress === undefined) {
    return (
      <View testID={testID} style={[layout, { backgroundColor: theme.colors.surface.primary }]}>
        {children}
      </View>
    );
  }

  requireText(props.accessibilityLabel, 'accessibilityLabel', 'Card');
  // The affordance is a full-card press state: the whole surface shifts tone and scales.
  return (
    <PressableSurface
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityHint}
      onPress={props.onPress}
      testID={testID}
      layout={layout}
      fill={{ rest: theme.colors.surface.primary, pressed: theme.colors.surface.sunken }}
    >
      {children}
    </PressableSurface>
  );
}
