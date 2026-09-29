/**
 * expo-notifications for tests (jest-setup mocks the module with this): the OS in memory, so
 * no test reaches a native module. Permission starts undetermined, as on a fresh install, and
 * a request grants it. Reset before each test.
 */
type Request = { identifier: string; content: { data?: unknown }; trigger: unknown };

const pending = new Map<string, Request>();
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
};

export const notificationsMock = {
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: jest.fn(implementations.getPermissionsAsync),
  requestPermissionsAsync: jest.fn(implementations.requestPermissionsAsync),
  getAllScheduledNotificationsAsync: jest.fn(implementations.getAllScheduledNotificationsAsync),
  scheduleNotificationAsync: jest.fn(implementations.scheduleNotificationAsync),
  cancelScheduledNotificationAsync: jest.fn(implementations.cancelScheduledNotificationAsync),
  setNotificationChannelAsync: jest.fn(implementations.setNotificationChannelAsync),
  setNotificationHandler: jest.fn(implementations.setNotificationHandler),
};

/** Empties the OS and restores each function, including any a test overrode. */
export function resetNotificationsMock(): void {
  pending.clear();
  permission = initial();
  for (const [name, implementation] of Object.entries(implementations)) {
    const fn = notificationsMock[name as keyof typeof implementations] as jest.Mock;
    fn.mockReset();
    fn.mockImplementation(implementation);
  }
}

/** What the OS holds now. */
export const scheduledNotifications = () => [...pending.values()];
