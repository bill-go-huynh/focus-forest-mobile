import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { sendAnalyticsEvents, useSession, type ApiClient } from '../api';
import { createClientId } from '../ids/client-id';
import { usePreferences } from '../preferences';
import { AnalyticsQueue, type AnalyticsEventName, type AnalyticsProps } from './analytics-queue';

/** Debounce of sends after a recorded event: a few events travel together. */
const SEND_DELAY_MS = 2_000;

const deviceLocalDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** The app's queue, over AsyncStorage and the API client. */
export function createAppAnalyticsQueue(client: ApiClient): AnalyticsQueue {
  return new AnalyticsQueue({
    storage: AsyncStorage,
    send: (events) => sendAnalyticsEvents(client, events),
    now: () => new Date(),
    newId: () => createClientId(),
    platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    localDateOf: deviceLocalDate,
  });
}

const AnalyticsContext = createContext<AnalyticsQueue | null>(null);

/**
 * Product analytics for the Core Loop Checkpoint (CR.6): follows the signed-in user and their
 * `shareUsageData`, records one `app_opened` per launch and an `app_foregrounded` on returns,
 * and sends the queue after events, on returns, and once sharing is known.
 */
export function AnalyticsProvider({
  queue,
  children,
}: {
  queue: AnalyticsQueue;
  children: ReactNode;
}) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const preferences = usePreferences({ enabled: userId !== null });
  const sharing = preferences.data?.shareUsageData;
  const opened = useRef<string | null>(null);

  const previousUser = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousUser.current;
    previousUser.current = userId;
    if (!userId) {
      // A sign-out (not the launch, while the saved session is still being restored).
      if (previous) void queue.signOut();
      return;
    }
    void queue
      .activate(userId)
      .then(async () => {
        if (opened.current === userId) return;
        opened.current = userId;
        await queue.record('app_opened');
      })
      .then(() => queue.flush());
  }, [queue, userId]);

  useEffect(() => {
    if (sharing === undefined || !userId) return;
    void queue.activate(userId).then(() => {
      queue.setSharing(sharing);
      return queue.flush();
    });
  }, [queue, userId, sharing]);

  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if ((previous === 'background' || previous === 'inactive') && next === 'active') {
        void queue.foregrounded().then(() => queue.flush());
      }
      previous = next;
    });
    return () => subscription.remove();
  }, [queue]);

  return <AnalyticsContext.Provider value={queue}>{children}</AnalyticsContext.Provider>;
}

/** Records a product event (and sends soon). A no-op outside the provider (tests, previews). */
export function useTrackEvent(): (name: AnalyticsEventName, props?: AnalyticsProps) => void {
  const queue = useContext(AnalyticsContext);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (name, props) => {
    if (!queue) return;
    void queue.record(name, props).then(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void queue.flush(), SEND_DELAY_MS);
    });
  };
}

/** Records `name` once when a screen opens. */
export function useTrackScreen(name: AnalyticsEventName, props?: AnalyticsProps): void {
  const track = useTrackEvent();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    track(name, props);
    // Once per mount: later prop changes are the same screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
