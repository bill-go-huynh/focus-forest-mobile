import { Stack } from 'expo-router';

/**
 * Signed out: the welcome first (docs/02 Onboarding: the concept before account creation), then
 * sign up or sign in above it, so back returns to the welcome.
 */
export const unstable_settings = { initialRouteName: 'welcome' };

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="sign-in" />
    </Stack>
  );
}
