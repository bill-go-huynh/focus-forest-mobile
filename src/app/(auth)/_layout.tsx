import { Stack } from 'expo-router';

/**
 * Signed out: the welcome first (docs/02 Onboarding: the concept before account creation), with
 * sign up or sign in above it, so back returns to it. Every signed-out launch and every sign-out
 * opens it (owner, 2026-10-22); each page leads straight to sign up and sign in.
 */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      {/* W.3 Forgot password, from sign in. */}
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
