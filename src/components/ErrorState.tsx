import { useEffect, useState } from 'react';
import { Animated, Easing, Text } from 'react-native';

import { announce, useFontScale, useReducedMotion } from '../accessibility';
import { useTheme } from '../theme';
import { Button } from './Button';
import { assertCalmCopy } from './calm-copy';
import { SpotIllustration, type IllustrationId } from './illustrations';

/**
 * Error state (docs/01_DESIGN_SYSTEM.md §9): plain language, no blame, a clear retry
 * where retrying can help. It fades in calmly and never shakes (docs/04 §4). The message
 * is never painted red.
 */
export interface ErrorStateProps {
  /** Plain and kind. Default: "We couldn't load this right now." */
  message?: string;
  /** Reassurance that nothing was lost, such as a session saved on the device. */
  reassurance?: string;
  /** Shown only when retrying can help. */
  onRetry?: () => void;
  /** Default "Try again". */
  retryLabel?: string;
  illustration?: IllustrationId;
  testID?: string;
}

const DEFAULT_MESSAGE = "We couldn't load this right now.";

export function ErrorState({
  message = DEFAULT_MESSAGE,
  reassurance,
  onRetry,
  retryLabel = 'Try again',
  illustration = 'lantern',
  testID = 'error-state',
}: ErrorStateProps) {
  const theme = useTheme();
  const { colors, space, type } = theme;
  const reducedMotion = useReducedMotion();
  const { isLargeText } = useFontScale();
  assertCalmCopy(message, 'ErrorState');
  if (reassurance) assertCalmCopy(reassurance, 'ErrorState');

  const [opacity] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));
  const spoken = reassurance ? `${message} ${reassurance}` : message;

  useEffect(() => {
    if (!reducedMotion) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: theme.motion.base,
        easing: Easing.bezier(...theme.easing.enter),
        useNativeDriver: true,
      }).start();
    }
    // Only a fade: under reduced motion the state is already fully shown.
  }, [opacity, reducedMotion, theme.motion.base, theme.easing.enter]);

  // Read once when the error appears, and again only when its wording changes.
  useEffect(() => {
    announce(spoken);
  }, [spoken]);

  return (
    <Animated.View
      testID={testID}
      style={{ alignItems: 'center', gap: space[4], padding: space[6], opacity }}
    >
      <SpotIllustration
        id={illustration}
        size={isLargeText ? theme.illustration.spot / 2 : theme.illustration.spot}
      />
      <Text
        accessibilityLiveRegion="polite"
        style={[type.body, { color: colors.text.primary, textAlign: 'center' }]}
      >
        {message}
      </Text>
      {reassurance ? (
        <Text style={[type.body, { color: colors.text.secondary, textAlign: 'center' }]}>
          {reassurance}
        </Text>
      ) : null}
      {onRetry ? <Button variant="secondary" label={retryLabel} onPress={onRetry} /> : null}
    </Animated.View>
  );
}
