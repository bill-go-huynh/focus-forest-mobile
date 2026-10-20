import { act, configure } from '@testing-library/react-native';
import { notifyManager, type QueryClient } from '@tanstack/react-query';

/**
 * Shared test setup (package.json → jest.setupFilesAfterEnv).
 *
 * - waitFor and findBy resolve as soon as their condition holds, so a generous limit costs
 *   nothing when tests pass; it only leaves room when the machine is busy.
 * - Every QueryClient the app creates keeps the app's retry policy but never schedules garbage
 *   collection (gcTime: Infinity), and is cleared after each test. Otherwise 5-minute gc timers
 *   outlive the tests and keep the jest worker from exiting.
 * - TanStack Query notifies React through timers; those updates run inside act().
 * - renderRouter turns on fake timers; each test starts with real ones again.
 */
// AsyncStorage is native; its own jest mock keeps data in memory (the root layout restores the
// active timer through it).
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Reanimated runs worklets natively; tests use the library's own mock and its Jest setup, so
// animations run on the JS thread with Jest's timers.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
(
  jest.requireActual('react-native-reanimated') as typeof import('react-native-reanimated')
).setUpTests();

// expo-notifications is native: tests get the OS in memory (src/test-utils/notifications-mock).
jest.mock('expo-notifications', () => jest.requireActual('./notifications-mock').notificationsMock);
beforeEach(() => {
  (
    jest.requireActual('./notifications-mock') as typeof import('./notifications-mock')
  ).resetNotificationsMock();
});

// Google Sign-In is native (W.2): tests get it in memory (src/test-utils/google-signin-mock).
jest.mock(
  '@react-native-google-signin/google-signin',
  () => jest.requireActual('./google-signin-mock').googleSignInMock,
);
beforeEach(() => {
  (
    jest.requireActual('./google-signin-mock') as typeof import('./google-signin-mock')
  ).resetGoogleSignInMock();
});

// Capturing a view and the native share sheet are native (M3.4 recap card): tests get fakes that
// answer a temporary image and share it, reset before each test.
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///tmp/recap-card.png'),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
beforeEach(() => {
  const viewShot =
    jest.requireMock<typeof import('react-native-view-shot')>('react-native-view-shot');
  jest.mocked(viewShot.captureRef).mockReset().mockResolvedValue('file:///tmp/recap-card.png');
  const sharing = jest.requireMock<typeof import('expo-sharing')>('expo-sharing');
  jest.mocked(sharing.isAvailableAsync).mockReset().mockResolvedValue(true);
  jest.mocked(sharing.shareAsync).mockReset().mockResolvedValue(undefined);
});

// Node's own WebSocket would reach the network: the signed-in app opens the demo channel (DM.3)
// for every account, so tests get a socket that never connects. Suites that need a live channel
// put their own fake in its place.
class QuietSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(): void {}
  close(): void {
    this.readyState = 3;
  }
}
(globalThis as { WebSocket?: unknown }).WebSocket = QuietSocket;

// 10 s: Phase 5 added suites that open the whole app, and with four workers a first render
// sometimes passed 5 s under load (a different test each run, every one green alone).
configure({ asyncUtilTimeout: 10_000 });
notifyManager.setNotifyFunction((notify) => {
  act(notify);
});

const queryClients: QueryClient[] = [];

jest.mock('../api/query-client', () => {
  const actual = jest.requireActual<typeof import('../api/query-client')>('../api/query-client');
  return {
    ...actual,
    createQueryClient: () => {
      const client = actual.createQueryClient();
      const defaults = client.getDefaultOptions();
      client.setDefaultOptions({
        queries: { ...defaults.queries, gcTime: Infinity },
        mutations: { ...defaults.mutations, gcTime: Infinity },
      });
      queryClients.push(client);
      return client;
    },
  };
});

afterEach(() => {
  for (const client of queryClients.splice(0)) {
    client.cancelQueries();
    client.clear();
  }
  jest.useRealTimers();
});
