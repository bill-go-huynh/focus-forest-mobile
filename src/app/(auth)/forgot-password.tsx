import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import {
  FormMessage,
  resetConfirmSchema,
  resetRequestSchema,
  usePasswordReset,
  type ResetConfirmValues,
  type ResetRequestValues,
} from '../../auth';
import { Button } from '../../components/Button';
import { Input, type InputHandle } from '../../components/Input';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../theme';

/**
 * W.3 Forgot password, from sign in: the email (carried from sign in) gets a 6-digit code, then
 * the code and a new password sign in. The words never say whether the email has an account.
 */
export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { sendCode, confirm, sentTo, busy, error } = usePasswordReset();
  const passwordRef = useRef<InputHandle>(null);
  const request = useForm<ResetRequestValues>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: { email: typeof params.email === 'string' ? params.email : '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });
  const reset = useForm<ResetConfirmValues>({
    resolver: zodResolver(resetConfirmSchema),
    defaultValues: { code: '', password: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });
  const send = request.handleSubmit((values) => sendCode(values.email));
  const back = () => (router.canGoBack() ? router.back() : router.replace('/sign-in'));
  const body = [theme.type.body, { color: theme.colors.text.secondary }];

  return (
    <Screen title="Reset your password">
      {sentTo ? (
        <>
          <Text style={body}>
            {`If an account uses ${sentTo}, we sent it a 6-digit code. It works for 15 minutes.`}
          </Text>
          <View style={{ gap: theme.space[4] }}>
            <Controller
              control={reset.control}
              name="code"
              render={({ field, fieldState }) => (
                <Input
                  ref={field.ref}
                  label="6-digit code"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              )}
            />
            <Controller
              control={reset.control}
              name="password"
              render={({ field, fieldState }) => (
                <Input
                  ref={passwordRef}
                  label="New password"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  helper="At least 8 characters. Your other devices will sign in again."
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={reset.handleSubmit(confirm)}
                />
              )}
            />
          </View>
          {error ? <FormMessage message={error.message} /> : null}
          <View style={{ gap: theme.space[3] }}>
            <Button
              variant="primary"
              label={busy ? 'Saving…' : 'Set new password'}
              onPress={reset.handleSubmit(confirm)}
              disabled={busy}
            />
            <Button
              variant="tertiary"
              label="Send a new code"
              onPress={() => void sendCode(sentTo)}
              disabled={busy}
            />
          </View>
        </>
      ) : (
        <>
          <Text style={body}>We will email you a code to set a new password.</Text>
          <Controller
            control={request.control}
            name="email"
            render={({ field, fieldState }) => (
              <Input
                ref={field.ref}
                label="Email"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="username"
                returnKeyType="send"
                onSubmitEditing={send}
              />
            )}
          />
          {error ? <FormMessage message={error.message} /> : null}
          <Button
            variant="primary"
            label={busy ? 'Sending…' : 'Send code'}
            onPress={send}
            disabled={busy}
          />
        </>
      )}
      <Button variant="tertiary" label="Back to sign in" onPress={back} disabled={busy} />
    </Screen>
  );
}
