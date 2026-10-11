import { Text } from 'react-native';

import type { SessionEventResult } from '../api';
import { useChallengeLists } from '../challenges/queries';
import { useTheme } from '../theme';
import { completionLine } from './event-format';
import { useEvents } from './queries';

/**
 * Session Completion's one line (docs/05: "one line of mission or challenge progress"): what this
 * session did for an event, as the server stored it, else the user's challenge. Nothing otherwise.
 */
export function CompletionLine({ results }: { results: readonly SessionEventResult[] | null }) {
  const theme = useTheme();
  const events = useEvents();
  const challenges = useChallengeLists();
  const line = completionLine(results, events.data, challenges.data);
  if (!line) return null;
  return <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>{line}</Text>;
}
