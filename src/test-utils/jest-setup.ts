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
configure({ asyncUtilTimeout: 5_000 });
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
