import { Text, View } from 'react-native';

import { useFontScale } from '../accessibility';
import { useTheme } from '../theme';
import { Button } from './Button';
import { assertCalmCopy, assertOneSentence } from './calm-copy';
import { SpotIllustration, type IllustrationId } from './illustrations';
import { requireText } from './PressableSurface';

/**
 * Empty state (docs/01_DESIGN_SYSTEM.md §9): an opportunity, not an apology. A small calm
 * illustration, one sentence that frames it positively, and at most one action. No motion
 * (docs/04 §4).
 */
export interface EmptyStateProps {
  illustration: IllustrationId;
  /** One sentence, framed positively. */
  message: string;
  /** At most one action, shown as a primary button. */
  action?: { label: string; onPress: () => void };
  testID?: string;
}

export function EmptyState({ illustration, message, action, testID }: EmptyStateProps) {
  const theme = useTheme();
  const { isLargeText } = useFontScale();
  requireText(message, 'message', 'EmptyState');
  assertOneSentence(message, 'EmptyState');
  assertCalmCopy(message, 'EmptyState');

  return (
    <View
      testID={testID}
      style={{ alignItems: 'center', gap: theme.space[4], padding: theme.space[6] }}
    >
      {/* At 200% text the illustration gives up room before the sentence does. */}
      <SpotIllustration
        id={illustration}
        size={isLargeText ? theme.illustration.spot / 2 : theme.illustration.spot}
      />
      <Text style={[theme.type.body, { color: theme.colors.text.primary, textAlign: 'center' }]}>
        {message}
      </Text>
      {action ? <Button variant="primary" label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}
