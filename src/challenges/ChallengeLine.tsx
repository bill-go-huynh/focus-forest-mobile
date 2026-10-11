import { Text } from 'react-native';

import { useTheme } from '../theme';
import { completionChallengeLine } from './challenge-format';
import { useChallengeLists } from './queries';

/**
 * Session Completion's one line of challenge progress (docs/05), read from the server once it
 * knows the session: the first active challenge the user joined. Nothing when there is none or
 * it cannot be read.
 */
export function ChallengeLine() {
  const theme = useTheme();
  const lists = useChallengeLists();
  const line = lists.data ? completionChallengeLine(lists.data) : null;
  if (!line) return null;
  return <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>{line}</Text>;
}
