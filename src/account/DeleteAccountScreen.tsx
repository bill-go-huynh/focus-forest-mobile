import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  deleteAccount,
  HttpError,
  NetworkError,
  useApi,
  useSession,
  type DeleteConfirmation,
} from '../api';
import { FormMessage } from '../auth';
import { requestGoogleIdToken } from '../auth/google';
import { DestructiveButton } from '../components/Button';
import { Input } from '../components/Input';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme';
import { forgetDeviceData } from './device-data';

const CONFIRM_WORD = 'DELETE';

function describeError(error: unknown): string {
  if (error instanceof NetworkError) {
    return "We couldn't reach Focus Forest, so nothing was deleted. Check your connection and try again.";
  }
  if (error instanceof HttpError && error.code === 'password_incorrect') {
    return 'That password is not right.';
  }
  if (error instanceof HttpError && error.code === 'google_account_mismatch') {
    return 'That Google account is not the one you sign in with. Nothing was deleted.';
  }
  return "We couldn't delete your account. Nothing was deleted; please try again.";
}

/**
 * Deleting the account (M7.1; docs/11 Privacy; Phase 7 owner decision 3), under Settings. This
 * screen is the confirmation: it says what is erased and what stays, and asks for the password
 * and DELETE typed out. The account is then deleted at once on the server; the device forgets
 * everything it kept for it, and the app returns to its start. W.2: an account that signs in only
 * with Google has no password; it confirms with Google's chooser instead, after DELETE.
 */
export function DeleteAccountScreen() {
  const theme = useTheme();
  const { client, auth } = useApi();
  const { user } = useSession();
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withGoogle = user?.signInMethod === 'google';
  const ready = (withGoogle || password.length > 0) && typed.trim() === CONFIRM_WORD && !busy;

  const remove = async () => {
    const userId = user?.id;
    if (!userId) return;
    setBusy(true);
    setError(null);
    let confirmation: DeleteConfirmation = { password };
    if (withGoogle) {
      const google = await requestGoogleIdToken();
      if (google.kind !== 'token') {
        if (google.kind !== 'cancelled') {
          setError("We couldn't confirm with Google. Nothing was deleted; please try again.");
        }
        setBusy(false);
        return;
      }
      confirmation = { googleIdToken: google.idToken };
    }
    try {
      await deleteAccount(client, confirmation);
    } catch (caught) {
      setError(describeError(caught));
      setBusy(false);
      return;
    }
    // The device is no longer registered (the server removed it), so sign-out only clears the
    // session; then nothing of the account stays on this device.
    await auth.signOut();
    await forgetDeviceData(userId);
  };

  const body = [theme.type.body, { color: theme.colors.text.primary }];
  return (
    <Screen title="Delete account" safeTop={false}>
      <View style={{ gap: theme.space[3] }}>
        <Text style={body}>
          Your sessions, notes, trees, rewards, and friends are erased from Focus Forest right away.
          This cannot be undone.
        </Text>
        <Text style={body}>
          Minutes you gave to a Community Tree stay in its total, without your name.
        </Text>
        <Text style={body}>You can download a copy of your data first, from Settings.</Text>
        {withGoogle ? (
          <Text style={body}>Google asks you to confirm it is your account.</Text>
        ) : (
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
          />
        )}
        <Input
          label={`Type ${CONFIRM_WORD} to confirm`}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {error ? <FormMessage message={error} /> : null}
        {/* Typing DELETE and the password is this action's confirmation step. */}
        <DestructiveButton
          label="Delete my account"
          disabled={!ready}
          disabledReason={
            withGoogle ? 'Type DELETE first.' : 'Enter your password and type DELETE first.'
          }
          onRequestConfirm={() => void remove()}
        />
      </View>
    </Screen>
  );
}
