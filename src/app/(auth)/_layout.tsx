import { Stack } from 'expo-router';

import { useWelcome } from '../../welcome/WelcomeProvider';

/**
 * Signed out: the welcome first (docs/02 Onboarding: the concept before account creation), with
 * sign up or sign in above it, so back returns to it. Once an account has signed in on this
 * device the welcome is done (W.1), and sign in comes first.
 */
export default function AuthLayout() {
  const { done } = useWelcome();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!done}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
