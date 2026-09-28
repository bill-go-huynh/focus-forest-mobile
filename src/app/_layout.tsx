import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  ApiProvider,
  createApi,
  createQueryClient,
  readApiBaseUrl,
  secureTokenStore,
  useApi,
  useSession,
} from '../api';
import { AuthFlowProvider, useAuthFlow } from '../auth';
import { AppearanceProviders, useWaitingForPreferences } from '../preferences';
import { createAppSessionOutbox, SessionOutboxProvider } from '../sessions';
import { useTheme } from '../theme';
import { ActiveTimerProvider, createAppTimerStore } from '../timer';
import {
  createAppTopicCreateQueue,
  createAppTopicStore,
  TopicCacheProvider,
  TopicCreateQueueProvider,
} from '../topics';

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  // The base URL is read on first request, so a missing EXPO_PUBLIC_API_URL fails requests
  // with a ConfigurationError instead of crashing the app shell.
  const [api] = useState(() =>
    createApi({ baseUrl: readApiBaseUrl, fetch: globalThis.fetch, store: secureTokenStore }),
  );
  const [timers] = useState(createAppTimerStore);
  const [topics] = useState(createAppTopicStore);
  const [topicCreates] = useState(() =>
    createAppTopicCreateQueue({ client: api.client, queryClient, snapshots: topics }),
  );
  const [sessions] = useState(() =>
    createAppSessionOutbox({ client: api.client, queryClient, topicQueue: topicCreates }),
  );

  return (
    <ApiProvider api={api} queryClient={queryClient}>
      {/* The signed-in user's timer is restored (and settled) as soon as they are known. */}
      <ActiveTimerProvider store={timers}>
        {/* The signed-in user's last known topics are shown even when a launch is offline. */}
        <TopicCacheProvider store={topics}>
          {/* Topics created offline are kept and sent when the server can be reached. */}
          <TopicCreateQueueProvider queue={topicCreates}>
            {/* A finished timer's session is queued on the device, then sent when it can be. */}
            <SessionOutboxProvider outbox={sessions}>
              {/* Theme and reduced motion follow the user's preferences (A5), app-wide. */}
              <AppearanceProviders>
                <SafeAreaProvider>
                  <AuthFlowProvider>
                    <RootNavigator />
                  </AuthFlowProvider>
                  <ThemedStatusBar />
                </SafeAreaProvider>
              </AppearanceProviders>
            </SessionOutboxProvider>
          </TopicCreateQueueProvider>
        </TopicCacheProvider>
      </ActiveTimerProvider>
    </ApiProvider>
  );
}

/**
 * Restores the saved session once at launch, then shows the tabs or the auth screens.
 * While the status is unknown only a plain themed screen shows, so neither side flashes.
 */
function RootNavigator() {
  const { auth } = useApi();
  const { status } = useSession();
  const { completingSignUp } = useAuthFlow();
  const waitingForPreferences = useWaitingForPreferences();

  useEffect(() => {
    void auth.restoreSession();
  }, [auth]);

  if (status === 'unknown') return <LaunchScreen />;

  const signedIn = status === 'authenticated' && !completingSignUp;
  // The navigator mounts once the session is known, so the opening URL is kept. While a
  // signed-in launch reads the saved theme, the launch screen stays on top, so a dark-theme
  // user never sees a light flash.
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        importantForAccessibility={waitingForPreferences ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={waitingForPreferences}
      >
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      </View>
      {waitingForPreferences ? <LaunchScreen overlay /> : null}
    </View>
  );
}

function LaunchScreen({ overlay = false }: { overlay?: boolean }) {
  const theme = useTheme();
  return (
    <View
      testID="launch-screen"
      style={[
        overlay ? StyleSheet.absoluteFill : { flex: 1 },
        { backgroundColor: theme.colors.background.primary },
      ]}
    />
  );
}

/** Light status bar text on the dark theme, dark text on the light theme. */
function ThemedStatusBar() {
  const theme = useTheme();
  return <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />;
}
