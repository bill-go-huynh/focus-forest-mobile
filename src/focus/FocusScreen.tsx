import { Text } from 'react-native';

import { Screen } from '../components/Screen';
import { useTheme } from '../theme';
import { useActiveTimer } from '../timer/ActiveTimerProvider';
import { formatMinutes } from './duration';

/**
 * The Focus route's minimal shell (M2.8): the place Start Focus opens once a timer is stored.
 * The countdown, pause, and end arrive with the Focus screen (M2.9).
 */
export function FocusScreen() {
  const theme = useTheme();
  const { timer } = useActiveTimer();
  return (
    <Screen title="Focus">
      <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>
        {timer
          ? `${formatMinutes(timer.plannedMinutes)} focus session`
          : 'No focus session is running.'}
      </Text>
    </Screen>
  );
}
