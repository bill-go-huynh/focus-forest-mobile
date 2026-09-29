/**
 * expo-notifications for tests (jest-setup mocks the module with this): the OS in memory, so
 * no test reaches a native module. Permission starts undetermined, as on a fresh install, and
 * a request grants it. Reset before each test.
 */
type Request = { identifier: string; content: { data?: unknown }; trigger: unknown };

const pending = new Map<string, Request>();
const tapListeners = new Set<(response: unknown) => void>();
let launchTap: unknown = null;
const initial = () => ({ status: 'undetermined', canAskAgain: true, granted: false });
let permission = initial();

const implementations = {
  getPermissionsAsync: async () => permission,
  requestPermissionsAsync: async () => {
    permission = { status: 'granted', canAskAgain: true, granted: true };
    return permission;
  },
  getAllScheduledNotificationsAsync: async () => [...pending.values()],
  scheduleNotificationAsync: async (request: Request) => {
    pending.set(request.identifier, request);
    return request.identifier;
  },
  cancelScheduledNotificationAsync: async (identifier: string) => {
    pending.delete(identifier);
  },
  setNotificationChannelAsync: async () => null,
  setNotificationHandler: () => undefined,
  addNotificationResponseReceivedListener: (listener: (response: unknown) => void) => {
    tapListeners.add(listener);
    return { remove: () => tapListeners.delete(listener) };
  },
  getLastNotificationResponseAsync: async () => launchTap,
  clearLastNotificationResponseAsync: async () => {
    launchTap = null;
  },
};

const DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';

export const notificationsMock = {
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  DEFAULT_ACTION_IDENTIFIER,
  getPermissionsAsync: jest.fn(implementations.getPermissionsAsync),
  requestPermissionsAsync: jest.fn(implementations.requestPermissionsAsync),
  getAllScheduledNotificationsAsync: jest.fn(implementations.getAllScheduledNotificationsAsync),
  scheduleNotificationAsync: jest.fn(implementations.scheduleNotificationAsync),
  cancelScheduledNotificationAsync: jest.fn(implementations.cancelScheduledNotificationAsync),
  setNotificationChannelAsync: jest.fn(implementations.setNotificationChannelAsync),
  setNotificationHandler: jest.fn(implementations.setNotificationHandler),
  addNotificationResponseReceivedListener: jest.fn(
    implementations.addNotificationResponseReceivedListener,
  ),
  getLastNotificationResponseAsync: jest.fn(implementations.getLastNotificationResponseAsync),
  clearLastNotificationResponseAsync: jest.fn(implementations.clearLastNotificationResponseAsync),
};

/** Empties the OS and restores each function, including any a test overrode. */
export function resetNotificationsMock(): void {
  pending.clear();
  tapListeners.clear();
  launchTap = null;
  permission = initial();
  for (const [name, implementation] of Object.entries(implementations)) {
    const fn = notificationsMock[name as keyof typeof implementations] as jest.Mock;
    fn.mockReset();
    fn.mockImplementation(implementation);
  }
}

/** What the OS holds now. */
export const scheduledNotifications = () => [...pending.values()];

/** A tap on a notification carrying this data, as the OS reports it. */
function tapResponse(data: unknown) {
  return {
    actionIdentifier: DEFAULT_ACTION_IDENTIFIER,
    notification: { request: { identifier: 'tapped', content: { data }, trigger: null } },
  };
}

/** The user taps a notification while the app runs. */
export function tapNotification(data: unknown): void {
  for (const listener of [...tapListeners]) listener(tapResponse(data));
}

/** The app is launched by a tap on a notification. */
export function launchFromNotification(data: unknown): void {
  launchTap = tapResponse(data);
}
