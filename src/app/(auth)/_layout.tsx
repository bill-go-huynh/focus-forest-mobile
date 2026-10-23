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
      {/* A back arrow on every form, to the welcome or the form before (owner, 2026-10-23). */}
      <Stack.Screen name="sign-in" options={{ headerShown: true, title: '' }} />
      <Stack.Screen name="sign-up" options={{ headerShown: true, title: '' }} />
      {/* W.3 Forgot password, from sign in. */}
      <Stack.Screen name="forgot-password" options={{ headerShown: true, title: '' }} />
    </Stack>
  );
}
