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
import { createAppCelebrationStore } from '../celebrations/celebration-store';
import { CelebrationsProvider } from '../celebrations/CelebrationsProvider';
import { CompletionIntents, CompletionIntentsProvider, CompletionNavigator } from '../completion';
import {
  createAppTimerNotifications,
  onTimerNotificationTap,
  TimerNotificationSync,
} from '../notifications';
import { createAppHomeSnapshotStore } from '../core-loop/home-snapshot-store';
import { HomeCacheProvider } from '../core-loop/HomeCacheProvider';
import { createAppHistorySnapshotStore, HistoryCacheProvider } from '../history';
import { createAppOnboardingStore } from '../onboarding/onboarding-store';
import { OnboardingNavigator } from '../onboarding/OnboardingNavigator';
import { OnboardingProvider } from '../onboarding/OnboardingProvider';
import { AppearanceProviders, useWaitingForPreferences } from '../preferences';
import {
  createAppCompletionReceipts,
  createAppSessionNotes,
  createAppSessionOutbox,
  CompletionReceiptsProvider,
  SessionNotesProvider,
  SessionOutboxProvider,
} from '../sessions';
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
  const [timerNotifications] = useState(() => createAppTimerNotifications(timers));
  const [topics] = useState(createAppTopicStore);
  const [topicCreates] = useState(() =>
    createAppTopicCreateQueue({ client: api.client, queryClient, snapshots: topics }),
  );
  const [receipts] = useState(createAppCompletionReceipts);
  const [celebrations] = useState(createAppCelebrationStore);
  const [homeSnapshots] = useState(createAppHomeSnapshotStore);
  const [history] = useState(createAppHistorySnapshotStore);
  const [onboarding] = useState(createAppOnboardingStore);
  const [sessions] = useState(() =>
    createAppSessionOutbox({
      client: api.client,
      queryClient,
      topicQueue: topicCreates,
      receipts,
      celebrations,
      currentUserId: () => api.session.getSnapshot().user?.id ?? null,
    }),
  );
  const [notes] = useState(() =>
    createAppSessionNotes({ client: api.client, sessions, timers, receipts }),
  );
  const [completions] = useState(() => new CompletionIntents());
  // Back in the foreground, after the timer is settled: the OS notifications are brought in
  // line, and what waits for the server is tried again (sessions first, then their notes).
  const [onForeground] = useState(() => () => {
    timerNotifications.reconcileLater();
    void sessions.flush().then(() => notes.flush());
  });

  return (
    <ApiProvider api={api} queryClient={queryClient}>
      {/* The signed-in user's timer is restored (and settled) as soon as they are known. */}
      <ActiveTimerProvider store={timers} onForeground={onForeground}>
        {/* The OS announces the session's end in the background, planned from the timer. */}
        <TimerNotificationSync coordinator={timerNotifications} />
        {/* The signed-in user's last known topics are shown even when a launch is offline. */}
        <TopicCacheProvider store={topics}>
          {/* Topics created offline are kept and sent when the server can be reached. */}
          <TopicCreateQueueProvider queue={topicCreates}>
            {/* The server's answers for recent sessions, kept so a tap opens them after a restart. */}
            {/* The history last loaded, so History and its sessions still show offline. */}
            <HistoryCacheProvider store={history}>
              <CompletionReceiptsProvider receipts={receipts}>
                {/* Server-confirmed tree growth still to be shown, kept across kills (M3.2). */}
                <CelebrationsProvider store={celebrations}>
                  {/* The last Home the server answered, so Home still shows offline. */}
                  <HomeCacheProvider store={homeSnapshots}>
                    {/* A finished timer's session is queued on the device, then sent when it can be. */}
                    <SessionOutboxProvider outbox={sessions}>
                      {/* Notes wait on the device until their session is on the server. */}
                      <SessionNotesProvider notes={notes}>
                        {/* Which Session Completion to open: a session ended here, or a tap. */}
                        <CompletionIntentsProvider
                          intents={completions}
                          listenForTaps={onTimerNotificationTap}
                        >
                          {/* Theme and reduced motion follow the user's preferences (A5), app-wide. */}
                          <AppearanceProviders>
                            <SafeAreaProvider>
                              {/* A new account's onboarding, kept across kills (M3.3). */}
                              <OnboardingProvider store={onboarding}>
                                <AuthFlowProvider>
                                  <RootNavigator />
                                </AuthFlowProvider>
                              </OnboardingProvider>
                              <ThemedStatusBar />
                            </SafeAreaProvider>
                          </AppearanceProviders>
                        </CompletionIntentsProvider>
                      </SessionNotesProvider>
                    </SessionOutboxProvider>
                  </HomeCacheProvider>
                </CelebrationsProvider>
              </CompletionReceiptsProvider>
            </HistoryCacheProvider>
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
            {/* Focus replaces the tabs while it runs (docs/05 §1). Its back asks to end the
                session first; the native swipe cannot, so it is off. */}
            <Stack.Screen name="focus" options={{ gestureEnabled: false }} />
            {/* Session Completion, a full-screen takeover too; Done returns Home. */}
            <Stack.Screen name="completion/[sessionId]" />
            {/* The current month's Tree Details, opened from the Home tree (docs/05). */}
            <Stack.Screen name="tree" />
            {/* Onboarding, once after sign-up (M3.3): it leaves by its own buttons. */}
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
            {/* Forest months (M3.4): an archived, resting, or growing month's Tree Details, the
                monthly recap, and the month-end planting ceremony (full screen, no tab bar). */}
            <Stack.Screen name="month/[year]/[month]" options={{ headerShown: true, title: '' }} />
            <Stack.Screen name="recap/[year]/[month]" />
            <Stack.Screen name="ceremony/[year]/[month]" options={{ gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      </View>
      {signedIn ? <CompletionNavigator /> : null}
      {signedIn ? <OnboardingNavigator /> : null}
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
