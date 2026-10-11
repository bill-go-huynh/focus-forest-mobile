import { Stack } from 'expo-router';

import { useTheme } from '../../../theme';

/**
 * Profile and the screens under it: Edit profile, Achievements, Goals and rest days, Topics,
 * and Settings (docs/05 §2, §4).
 */
export default function ProfileLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background.primary },
        headerTintColor: theme.colors.text.primary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background.primary },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Profile' }} />
      <Stack.Screen name="edit" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="achievements" options={{ title: 'Achievements' }} />
      <Stack.Screen name="goals" options={{ title: 'Goals and rest days' }} />
      <Stack.Screen name="topics" options={{ title: 'Topics' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
      <Stack.Screen name="blocked" options={{ title: 'Blocked people' }} />
    </Stack>
  );
}
