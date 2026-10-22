import { Text } from 'react-native';

import { useTheme } from '../theme';
import { completionChallengeLine } from './challenge-format';
import { useChallengeLists } from './queries';

/**
 * Session Completion's one line (docs/05: "one line of challenge progress"): the user's current
 * challenge, as the server reports it. Nothing otherwise.
 */
export function CompletionChallengeLine() {
  const theme = useTheme();
  const challenges = useChallengeLists();
  const line = challenges.data ? completionChallengeLine(challenges.data) : null;
  if (!line) return null;
  return <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>{line}</Text>;
}
