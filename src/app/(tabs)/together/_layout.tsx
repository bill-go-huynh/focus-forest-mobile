import { Stack } from 'expo-router';

import { useTheme } from '../../../theme';

/**
 * Together and the screens under it (docs/05 §2): finding people, a person's profile, and a visit
 * to their forest. Each screen names itself in its own heading, so the stack header stays quiet.
 */
export default function TogetherLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background.primary },
        headerTintColor: theme.colors.text.primary,
        headerShadowVisible: false,
        headerTitle: '',
        contentStyle: { backgroundColor: theme.colors.background.primary },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Together' }} />
      <Stack.Screen name="search" options={{ title: 'Find people' }} />
      <Stack.Screen name="[userId]/index" options={{ title: 'Profile' }} />
      <Stack.Screen name="[userId]/forest" options={{ title: 'Forest' }} />
      <Stack.Screen name="room/[roomId]" options={{ title: 'Room' }} />
    </Stack>
  );
}
