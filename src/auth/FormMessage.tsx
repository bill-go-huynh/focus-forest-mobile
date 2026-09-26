import { useEffect } from 'react';
import { Text } from 'react-native';

import { announce } from '../accessibility';
import { useTheme } from '../theme';

/** A form-level message (for example, wrong credentials), shown and announced once. */
export function FormMessage({ message }: { message: string }) {
  const theme = useTheme();
  useEffect(() => {
    announce(message);
  }, [message]);
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[theme.type.body, { color: theme.colors.danger }]}
    >
      {message}
    </Text>
  );
}
