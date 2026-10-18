import { StyleSheet, Text, View } from 'react-native';

import { Button } from '../components/Button';
import { useTheme } from '../theme';
import { FormMessage } from './FormMessage';
import { GoogleMark } from './GoogleMark';
import { useGoogleSignIn } from './use-auth-forms';

/**
 * W.2 "Continue with Google" under the email form, on sign up and sign in, with its own calm
 * message. Not shown when the app has no Google client configured.
 */
export function GoogleSignInButton({ disabled = false }: { disabled?: boolean }) {
  const theme = useTheme();
  const { submit, busy, error, available } = useGoogleSignIn();
  if (!available) return null;
  return (
    <View style={{ gap: theme.space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <View
          style={{
            flex: 1,
            height: StyleSheet.hairlineWidth,
            backgroundColor: theme.colors.border.subtle,
          }}
        />
        <Text style={[theme.type.caption, { color: theme.colors.text.muted }]}>or</Text>
        <View
          style={{
            flex: 1,
            height: StyleSheet.hairlineWidth,
            backgroundColor: theme.colors.border.subtle,
          }}
        />
      </View>
      {error ? <FormMessage message={error.message} /> : null}
      <Button
        variant="secondary"
        label={busy ? 'Opening Google…' : 'Continue with Google'}
        icon={({ size }) => <GoogleMark size={size} />}
        onPress={() => void submit()}
        disabled={busy || disabled}
      />
    </View>
  );
}
