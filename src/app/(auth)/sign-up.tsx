import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { FormMessage, signUpSchema, useSignUp, type SignUpValues } from '../../auth';
import { Button } from '../../components/Button';
import { Input, type InputHandle } from '../../components/Input';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../theme';

export default function SignUpScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { submit, retryProfile, busy, error, profilePending } = useSignUp();
  const passwordRef = useRef<InputHandle>(null);
  const nameRef = useRef<InputHandle>(null);
  const { control, handleSubmit, setError } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: '', password: '', displayName: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  // An already-registered email belongs on the email field.
  useEffect(() => {
    if (error?.field) setError(error.field, { message: error.message });
  }, [error, setError]);

  return (
    <Screen title="Create your account">
      <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
        One month of focus grows one tree.
      </Text>
      <View style={{ gap: theme.space[4] }}>
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <Input
              ref={field.ref}
              label="Email"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              disabled={profilePending}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <Input
              ref={passwordRef}
              label="Password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              helper="At least 8 characters."
              disabled={profilePending}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => nameRef.current?.focus()}
            />
          )}
        />
        <Controller
          control={control}
          name="displayName"
          render={({ field, fieldState }) => (
            <Input
              ref={nameRef}
              label="Your name"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              helper="This is how Focus Forest greets you."
              disabled={profilePending}
              autoComplete="name"
              textContentType="nickname"
              maxLength={50}
              returnKeyType="done"
              onSubmitEditing={handleSubmit(submit)}
            />
          )}
        />
      </View>
      {error && !error.field ? <FormMessage message={error.message} /> : null}
      <View style={{ gap: theme.space[3] }}>
        {profilePending ? (
          <Button
            variant="primary"
            label={busy ? 'Saving your name…' : 'Try again'}
            onPress={retryProfile}
            disabled={busy}
          />
        ) : (
          <Button
            variant="primary"
            label={busy ? 'Creating your account…' : 'Create account'}
            onPress={handleSubmit(submit)}
            disabled={busy}
          />
        )}
        {profilePending ? null : (
          <Button
            variant="tertiary"
            label="I already have an account"
            onPress={() => router.replace('/sign-in')}
            disabled={busy}
          />
        )}
      </View>
    </Screen>
  );
}
