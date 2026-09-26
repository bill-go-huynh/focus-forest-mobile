import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { TextInput } from 'react-native';
import { Text as SvgText } from 'react-native-svg';

import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

const API = 'https://api.example.com';
const PROFILE_URL = `${API}/me/profile`;
const PROFILE = {
  id: 'user-1',
  displayName: 'Mai Anh',
  avatarUrl: null,
  bio: 'Reading at dawn.',
  joinDate: '2026-09-26T10:00:00.000Z',
  timezone: 'Europe/Zurich',
};

type Reply = { status: number; body?: unknown } | Error;
let requests: FakeRequest[];
let profile:
  | typeof PROFILE
  | (Omit<typeof PROFILE, 'displayName' | 'bio'> & {
      displayName: string | null;
      bio: string | null;
    });

/** A4 as implemented: PATCH applies only the fields sent, trimming, and blank bio → null. */
function a4(request: FakeRequest): Reply {
  if (request.url === `${API}/me/preferences`) return { status: 200, body: makePreferences() };
  if (request.url !== PROFILE_URL) return { status: 404, body: nestError(404, 'Not Found') };
  if (request.method === 'PATCH') {
    const changes = request.body as { displayName?: string; bio?: string | null };
    profile = {
      ...profile,
      ...(changes.displayName !== undefined ? { displayName: changes.displayName.trim() } : {}),
      ...(changes.bio !== undefined ? { bio: changes.bio?.trim() || null } : {}),
    };
  }
  return { status: 200, body: profile };
}

function serve(handler: (request: FakeRequest) => Reply | Promise<Reply>) {
  const net = fakeFetch(handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  profile = { ...PROFILE };
  serve(a4);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const settle = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
const patches = () => requests.filter((r) => r.method === 'PATCH' && r.url === PROFILE_URL);
const initialsShown = () =>
  screen.UNSAFE_root.findAll((node) => node.type === SvgText).map((node) => node.props.children);

async function openProfile() {
  const router = renderApp(appRoutes, { initialUrl: '/profile' });
  await screen.findByRole('header', { name: 'Profile' });
  return router;
}

async function openEdit() {
  const router = await openProfile();
  fireEvent.press(await screen.findByRole('button', { name: 'Edit profile' }));
  await screen.findByLabelText('Name');
  return router;
}

describe('Profile (A4: GET /me/profile)', () => {
  it('shows the avatar initials, name, bio, and join date from the API', async () => {
    await openProfile();
    expect(await screen.findByText('Mai Anh')).toBeOnTheScreen();
    expect(screen.getByText('Reading at dawn.')).toBeOnTheScreen();
    expect(screen.getByText('Joined September 2026')).toBeOnTheScreen();
    expect(initialsShown()).toEqual(['MA']);
    expect(requests.find((r) => r.url === PROFILE_URL)).toMatchObject({
      url: PROFILE_URL,
      method: 'GET',
      headers: { Authorization: 'Bearer test-access' },
    });
  });

  it('shows skeletons while loading, and tells screen readers it is loading', async () => {
    let release!: () => void;
    serve(async (request) => {
      if (request.url === PROFILE_URL) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return a4(request);
    });
    await openProfile();
    expect(await screen.findByLabelText('Loading your profile')).toBeOnTheScreen();
    expect(screen.queryByText('Mai Anh')).toBeNull();

    await act(async () => release());
    expect(await screen.findByText('Mai Anh')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Loading your profile')).toBeNull();
  });

  it('shows a calm error with a retry, and loads on retry', async () => {
    let attempts = 0;
    serve((request) =>
      request.url === PROFILE_URL && ++attempts <= 3
        ? { status: 503, body: nestError(503, 'Service Unavailable') }
        : a4(request),
    );
    await openProfile();

    expect(
      await screen.findByText("We couldn't load your profile right now.", {}, { timeout: 10_000 }),
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Mai Anh')).toBeOnTheScreen();
  }, 15_000);

  it('shows no statistics yet: there is no real data for them', async () => {
    await openProfile();
    await screen.findByText('Mai Anh');
    expect(
      screen.queryByText(/session|streak|hour|minute|\bmin\b|trees?\b|badge|focus time/i),
    ).toBeNull();
  });

  it('shows no bio line when there is no bio', async () => {
    profile = { ...PROFILE, bio: null };
    await openProfile();
    await screen.findByText('Mai Anh');
    const lines = screen
      .getByTestId('profile-card')
      .findAll((node) => String(node.type) === 'Text')
      .map((node) => node.props.children);
    expect(lines).toEqual(['Mai Anh', 'Joined September 2026']);
  });

  it('keeps Settings reachable from Profile', async () => {
    await openProfile();
    await screen.findByText('Mai Anh');
    expect(screen.getByRole('button', { name: 'Settings' })).toBeOnTheScreen();
  });

  describe('without a display name', () => {
    beforeEach(() => {
      profile = { ...PROFILE, displayName: null };
    });

    it('invites the user to add a name, and shows a seed instead of initials', async () => {
      await openProfile();
      expect(await screen.findByRole('button', { name: 'Add your name' })).toBeOnTheScreen();
      expect(initialsShown()).toEqual([]);
      expect(screen.getByTestId('avatar-seed', { includeHiddenElements: true })).toBeOnTheScreen();
    });

    it('opens the edit screen with an empty name field and saves the new name', async () => {
      const router = await openProfile();
      fireEvent.press(await screen.findByRole('button', { name: 'Add your name' }));
      expect(await screen.findByLabelText('Name')).toHaveProp('value', '');

      fireEvent.changeText(screen.getByLabelText('Name'), 'Mai');
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(router.getPathname()).toBe('/profile'));
      expect(patches()[0]!.body).toEqual({ displayName: 'Mai' });
      expect(await screen.findByText('Mai')).toBeOnTheScreen();
    });

    it('lets the user save a bio while leaving the name for later', async () => {
      await openProfile();
      fireEvent.press(await screen.findByRole('button', { name: 'Edit profile' }));
      fireEvent.changeText(await screen.findByLabelText('Bio'), 'Tea and code.');
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(patches()).toHaveLength(1));
      expect(patches()[0]!.body).toEqual({ bio: 'Tea and code.' });
    });
  });
});

describe('Edit profile (A4: PATCH /me/profile)', () => {
  it('opens one level under Profile, prefilled with the current name and bio', async () => {
    const router = await openEdit();
    expect(router.getPathname()).toBe('/profile/edit');
    expect(screen.getByLabelText('Name')).toHaveProp('value', 'Mai Anh');
    expect(screen.getByLabelText('Bio')).toHaveProp('value', 'Reading at dawn.');
  });

  it('shows the join date as read-only information, never as a field', async () => {
    await openEdit();
    expect(screen.getByLabelText('Joined, September 2026')).toBeOnTheScreen();
    const joinFields = screen.UNSAFE_root.findAll(
      (node) => node.type === TextInput && /join/i.test(String(node.props.accessibilityLabel)),
    );
    expect(joinFields).toHaveLength(0);
  });

  it('saves only the changed field, returns to Profile, and shows the saved value', async () => {
    const router = await openEdit();
    fireEvent.changeText(screen.getByLabelText('Bio'), 'Tea and code.');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(router.getPathname()).toBe('/profile'));
    expect(patches()).toHaveLength(1);
    expect(patches()[0]).toMatchObject({
      url: PROFILE_URL,
      body: { bio: 'Tea and code.' },
      headers: { Authorization: 'Bearer test-access' },
    });
    expect(await screen.findByText('Tea and code.')).toBeOnTheScreen();
  });

  it('never sends the join date, the time zone, or the avatar', async () => {
    await openEdit();
    fireEvent.changeText(screen.getByLabelText('Name'), 'Mai');
    fireEvent.changeText(screen.getByLabelText('Bio'), 'New bio');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(Object.keys(patches()[0]!.body as object).sort()).toEqual(['bio', 'displayName']);
  });

  it('clears the bio by sending null', async () => {
    await openEdit();
    fireEvent.changeText(screen.getByLabelText('Bio'), '   ');
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]!.body).toEqual({ bio: null });
  });

  it('goes back without a request when nothing changed', async () => {
    const router = await openEdit();
    fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(router.getPathname()).toBe('/profile'));
    expect(patches()).toHaveLength(0);
  });

  it('shows the bio length against its 160-character limit', async () => {
    await openEdit();
    expect(screen.getByText('16 / 160')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Bio'), 'Hello');
    expect(await screen.findByText('5 / 160')).toBeOnTheScreen();
  });

  describe('validation (matches A4)', () => {
    it.each([
      ['an emptied name', { Name: '   ' }, 'Add the name you would like to be called.'],
      [
        'a name over 50 characters',
        { Name: 'x'.repeat(51) },
        'Keep your name to 50 characters or fewer.',
      ],
      ['a name on two lines', { Name: 'Mai\nAnh' }, 'Keep your name on one line.'],
      [
        'a bio over 160 characters',
        { Bio: 'x'.repeat(161) },
        'Keep your bio to 160 characters or fewer.',
      ],
    ])('stops %s with a kind message and no request', async (_case, edits, message) => {
      await openEdit();
      for (const [label, value] of Object.entries(edits)) {
        fireEvent.changeText(screen.getByLabelText(label), value);
      }
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));
      expect(await screen.findByText(message)).toBeOnTheScreen();
      await settle();
      expect(patches()).toHaveLength(0);
    });

    it('limits typing to the A4 lengths', async () => {
      await openEdit();
      expect(screen.getByLabelText('Name').props.maxLength).toBe(50);
      expect(screen.getByLabelText('Bio').props.maxLength).toBe(160);
      expect(screen.getByLabelText('Bio').props.multiline).toBe(true);
    });
  });

  describe('saving', () => {
    it('cannot be sent twice while saving', async () => {
      let release!: () => void;
      serve(async (request) => {
        if (request.method === 'PATCH') {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return a4(request);
      });
      await openEdit();
      fireEvent.changeText(screen.getByLabelText('Bio'), 'Tea and code.');
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));

      const busy = await screen.findByRole('button', { name: 'Saving…' });
      expect(busy).toBeDisabled();
      fireEvent.press(busy);
      await settle();
      expect(patches()).toHaveLength(1);
      await act(async () => release());
    });

    it('keeps the edits and explains a lost connection', async () => {
      serve((request) =>
        request.method === 'PATCH' ? new TypeError('Network request failed') : a4(request),
      );
      const router = await openEdit();
      fireEvent.changeText(screen.getByLabelText('Bio'), 'Tea and code.');
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText(
          "We couldn't reach Focus Forest. Check your connection and try again.",
        ),
      ).toBeOnTheScreen();
      expect(router.getPathname()).toBe('/profile/edit');
      expect(screen.getByLabelText('Bio')).toHaveProp('value', 'Tea and code.');
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
    });

    it('never shows a raw server message', async () => {
      serve((request) =>
        request.method === 'PATCH'
          ? { status: 400, body: nestError(400, 'property avatarUrl should not exist') }
          : a4(request),
      );
      await openEdit();
      fireEvent.changeText(screen.getByLabelText('Bio'), 'Tea and code.');
      fireEvent.press(screen.getByRole('button', { name: 'Save' }));

      expect(
        await screen.findByText("We couldn't save your profile just now. Please try again."),
      ).toBeOnTheScreen();
      expect(screen.queryByText(/avatarUrl/)).toBeNull();
    });
  });
});
