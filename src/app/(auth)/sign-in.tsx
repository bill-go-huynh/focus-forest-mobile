import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { FormMessage, signInSchema, useSignIn, type SignInValues } from '../../auth';
import { Button } from '../../components/Button';
import { Input, type InputHandle } from '../../components/Input';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../theme';

export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { submit, busy, error } = useSignIn();
  const passwordRef = useRef<InputHandle>(null);
  const { control, handleSubmit } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  });

  return (
    <Screen title="Welcome back">
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
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
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
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleSubmit(submit)}
            />
          )}
        />
      </View>
      {error ? <FormMessage message={error.message} /> : null}
      <View style={{ gap: theme.space[3] }}>
        <Button
          variant="primary"
          label={busy ? 'Signing in…' : 'Sign in'}
          onPress={handleSubmit(submit)}
          disabled={busy}
        />
        <Button
          variant="tertiary"
          label="Create an account"
          onPress={() => router.replace('/sign-up')}
          disabled={busy}
        />
      </View>
    </Screen>
  );
}
