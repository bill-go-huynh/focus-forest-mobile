import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo, Share } from 'react-native';

import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { WELCOME_TITLE } from '../test-utils/welcome';

/**
 * M7.1 Your data (docs/11 Privacy; Phase 7 owner decision 3): download a copy of everything
 * stored about you, and delete the account at once, confirmed by the password and by typing
 * DELETE. Afterwards the device keeps nothing of the account.
 */

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

const API = 'https://api.example.com';
const EXPORT = { exportedAt: '2026-11-02T10:00:00.000Z', account: { id: 'user-1' }, sessions: [] };
type Reply = { status: number; body?: unknown } | Error;
let requests: FakeRequest[];
let deleteReply: Reply;
let exportReply: Reply;

function api(request: FakeRequest): Reply {
  const { pathname } = new URL(request.url);
  if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
  if (pathname === '/me/profile')
    return {
      status: 200,
      body: {
        id: 'user-1',
        username: 'mai',
        displayName: 'Mai',
        avatarUrl: null,
        bio: null,
        joinDate: '2026-09-26T10:00:00.000Z',
        timezone: 'Europe/Zurich',
      },
    };
  if (pathname === '/me/export') return exportReply;
  if (pathname === '/me' && request.method === 'DELETE') return deleteReply;
  return { status: 404, body: nestError(404, 'Not Found') };
}

const originalFetch = globalThis.fetch;
beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  await AsyncStorage.clear();
  deleteReply = { status: 204 };
  exportReply = { status: 200, body: EXPORT };
  const net = fakeFetch(api);
  requests = net.requests;
  globalThis.fetch = net.fetch;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

async function openDeletion() {
  const router = renderApp(appRoutes, { initialUrl: '/profile/settings' });
  fireEvent.press(await screen.findByRole('button', { name: 'Delete account' }));
  await screen.findByText(/Your sessions, notes, trees/);
  return router;
}
const field = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);

describe('your data (M7.1)', () => {
  it('shares a copy of everything stored about you', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    renderApp(appRoutes, { initialUrl: '/profile/settings' });
    fireEvent.press(await screen.findByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0]![0]).toEqual({
      title: 'Focus Forest data',
      message: JSON.stringify(EXPORT, null, 2),
    });
    expect(requests.find((r) => r.url === `${API}/me/export`)).toMatchObject({
      headers: { Authorization: 'Bearer test-access' },
    });
  });

  it('says calmly when the copy cannot be made', async () => {
    exportReply = new TypeError('offline');
    renderApp(appRoutes, { initialUrl: '/profile/settings' });
    fireEvent.press(await screen.findByRole('button', { name: 'Download my data' }));
    expect(
      await screen.findByText(
        "We couldn't prepare your data. Check your connection and try again.",
      ),
    ).toBeOnTheScreen();
  });
});

describe('deleting the account (M7.1)', () => {
  it('says what is erased and what stays, before anything happens', async () => {
    await openDeletion();
    expect(
      screen.getByText(
        'Your sessions, notes, trees, rewards, and friends are erased from Focus Forest right away. This cannot be undone.',
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Minutes you gave to a Community Tree stay in its total, without your name.',
      ),
    ).toBeOnTheScreen();
    const button = screen.getByRole('button', { name: 'Delete my account' });
    expect(button).toBeDisabled();
    // DELETE alone is not enough: the password too.
    field('Type DELETE to confirm', 'DELETE');
    expect(button).toBeDisabled();
    field('Type DELETE to confirm', '');
    field('Password', 'correct horse');
    expect(button).toBeDisabled();
    field('Type DELETE to confirm', 'delete');
    // Typed exactly, in capitals.
    expect(button).toBeDisabled();
    field('Type DELETE to confirm', 'DELETE');
    expect(button).toBeEnabled();
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false);
  });

  it('deletes with the password, forgets the device data, and returns to the start', async () => {
    await AsyncStorage.multiSet([
      ['focus-forest/home/v1/user-1', '{}'],
      ['focus-forest/session-outbox/v1/user-1', '[]'],
      ['focus-forest/home/v1/someone-else', '{}'],
    ]);
    await openDeletion();
    field('Password', 'correct horse');
    field('Type DELETE to confirm', 'DELETE');
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByRole('header', { name: WELCOME_TITLE })).toBeOnTheScreen();
    expect(requests.find((r) => r.method === 'DELETE')).toMatchObject({
      url: `${API}/me`,
      body: { password: 'correct horse' },
    });
    await waitFor(async () =>
      expect(await AsyncStorage.getAllKeys()).toEqual(['focus-forest/home/v1/someone-else']),
    );
    const secureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: (key: string) => Promise<string | null>;
    };
    await expect(secureStore.getItemAsync('focus-forest.session')).resolves.toBeNull();
  });

  it('says so when the password is not right, and keeps everything', async () => {
    deleteReply = {
      status: 403,
      body: { ...nestError(403, 'That password is not right.'), code: 'password_incorrect' },
    };
    await openDeletion();
    field('Password', 'wrong');
    field('Type DELETE to confirm', 'DELETE');
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByText('That password is not right.')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: WELCOME_TITLE })).toBeNull();
  });

  it('keeps the account when the server cannot be reached', async () => {
    deleteReply = new TypeError('offline');
    await openDeletion();
    field('Password', 'correct horse');
    field('Type DELETE to confirm', 'DELETE');
    fireEvent.press(screen.getByRole('button', { name: 'Delete my account' }));
    expect(
      await screen.findByText(
        "We couldn't reach Focus Forest, so nothing was deleted. Check your connection and try again.",
      ),
    ).toBeOnTheScreen();
  });
});
