import AsyncStorage from '@react-native-async-storage/async-storage';
import { router as expoRouter } from 'expo-router';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { NetworkError, type HomeResponse } from '../api';
import { roomLinkKey } from '../rooms/room-links';
import { fakeFetch, makeSession, nestError, type FakeRequest } from '../test-utils/api';
import { makeCurrentTree, makeHome } from '../test-utils/core-loop';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { launchFromNotification, tapNotification } from '../test-utils/notifications-mock';
import { KAI, makeRoom, ME_ID, person, ROOM_ID, type RoomFixture } from '../test-utils/rooms';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { makeTopic } from '../test-utils/topics';
import { LINH_ID } from '../test-utils/social';
import { treeDto } from '../test-utils/trees';
import { WELCOME_TITLE } from '../test-utils/welcome';

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));

const API = 'https://api.example.com';
type Reply = { status: number; body?: unknown } | Error;
const TOPIC = makeTopic({ id: '0190c000-0000-7000-8000-00000000d001', name: 'Thesis' });

/**
 * A live channel in memory, standing in for React Native's WebSocket: the app sends `auth` and
 * `watch`, and the test pushes `room` messages as the server would after a change.
 */
class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  push(message: unknown) {
    act(() => this.onmessage?.({ data: JSON.stringify(message) }));
  }
}

/** The room channel's sockets (the demo channel, DM.3, opens its own). */
const roomSockets = () => FakeSocket.all.filter((s) => s.url.endsWith('/rooms/live'));

/**
 * A5.4 as these tests script it. Every change is REST and answers the room; `room` is what the
 * server holds now.
 */
function roomsApi() {
  const state = {
    room: makeRoom() as ReturnType<typeof makeRoom> | null,
    lobbies: [makeRoom({ you: null, others: [{ ...KAI, host: true, state: 'ready' }] })],
    current: null as ReturnType<typeof makeRoom> | null,
    joinAnswer: null as Reply | null,
    startAnswer: null as Reply | null,
    completeAnswer: null as Reply | null,
    created: [] as unknown[],
    // M6.2: who the user follows, and their room invitations.
    following: [] as unknown[],
    invites: [] as unknown[],
  };
  const set = (fixture: RoomFixture) => {
    state.room = makeRoom(fixture);
    return state.room;
  };
  const handler = ({ url, method, body }: FakeRequest): Reply | Promise<Reply> => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (pathname === '/auth/sign-in')
      return {
        status: 200,
        body: makeSession({
          accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          refreshTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          user: { id: ME_ID, email: 'mai@example.com' },
        }),
      };
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics') return { status: 200, body: [TOPIC] };
    if (pathname === '/me/home') {
      const home: HomeResponse = { ...makeHome(), tree: treeDto({ stage: 'sprout' }) };
      return { status: 200, body: home };
    }
    if (pathname === '/me/trees/current') return { status: 200, body: makeCurrentTree() };
    if (pathname === '/me/profile')
      return {
        status: 200,
        body: {
          id: ME_ID,
          username: 'mai',
          displayName: 'Mai Anh',
          avatarUrl: null,
          bio: null,
          joinDate: '2026-09-26T10:00:00.000Z',
          timezone: 'Europe/Zurich',
        },
      };
    if (pathname === '/me/following')
      return { status: 200, body: { items: state.following, nextCursor: null } };
    if (pathname === '/me/followers') return { status: 200, body: { items: [], nextCursor: null } };
    if (pathname === '/me/room-invites') return { status: 200, body: { items: state.invites } };
    if (pathname === `/me/room-invites/${ROOM_ID}` && method === 'DELETE') {
      state.invites = [];
      return { status: 204 };
    }
    if (pathname === `/rooms/${ROOM_ID}/invites` && method === 'POST')
      return { status: 200, body: state.room };
    if (pathname === '/me/warnings') return { status: 200, body: { items: [] } };
    if (pathname === '/me/reactions') return { status: 200, body: { items: [], nextCursor: null } };
    if (pathname === '/rooms' && method === 'GET')
      return { status: 200, body: { items: state.lobbies } };
    if (pathname === '/rooms' && method === 'POST') {
      state.created.push(body);
      const created = set({
        you: { host: true, state: 'waiting' },
        others: [],
        name: (body as { name: string }).name,
      });
      return { status: 201, body: created };
    }
    if (pathname === '/rooms/current') return { status: 200, body: { room: state.current } };
    if (pathname === '/rooms/join' && method === 'POST') {
      if (state.joinAnswer) return state.joinAnswer;
      return { status: 200, body: set({ you: { host: false, state: 'waiting' } }) };
    }
    if (pathname === `/rooms/${ROOM_ID}/join` && method === 'POST')
      return { status: 200, body: set({ you: { host: false, state: 'waiting' } }) };
    if (pathname === `/rooms/${ROOM_ID}`) {
      if (!state.room) return { status: 404, body: nestError(404, 'This room does not exist.') };
      return { status: 200, body: state.room };
    }
    if (pathname === `/rooms/${ROOM_ID}/ready`) {
      const ready = method === 'PUT';
      return {
        status: 200,
        body: set({ you: { host: true, state: ready ? 'ready' : 'waiting' } }),
      };
    }
    if (pathname === `/rooms/${ROOM_ID}/start` && method === 'POST') {
      if (state.startAnswer) return state.startAnswer;
      return {
        status: 200,
        body: set({
          phase: 'countdown',
          startsAt: new Date(Date.now() + 10_000).toISOString(),
          you: { host: true, state: 'focusing' },
          others: [{ id: KAI.id, name: 'Linh', username: 'linh', state: 'focusing' }],
        }),
      };
    }
    if (pathname === `/rooms/${ROOM_ID}/leave` && method === 'POST') {
      state.room = null;
      return { status: 200, body: makeRoom({ you: null }) };
    }
    if (pathname === `/rooms/${ROOM_ID}/complete` && method === 'POST') {
      if (state.completeAnswer) return state.completeAnswer;
      return {
        status: 200,
        body: {
          room: set({ phase: 'focusing', you: { host: true, state: 'completed' } }),
          progression: {
            newlyEarnedBadges: [
              {
                id: 'focus-together:first',
                name: 'Focus Together',
                description: 'Your first session in a room.',
                category: 'social',
                rarity: 'common',
                artworkId: 'focus-together-first',
                earnedAt: '2026-10-09T10:30:00.000Z',
              },
            ],
          },
        },
      };
    }
    if (pathname.startsWith('/me/sessions/')) return new NetworkError();
    return { status: 500, body: nestError(500, `Not in this test: ${method} ${pathname}`) };
  };
  return { handler, state, set };
}

let server: ReturnType<typeof roomsApi>;
let requests: FakeRequest[];
const originalFetch = globalThis.fetch;
const originalSocket = (globalThis as { WebSocket?: unknown }).WebSocket;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = API;
  signInForTest();
  server = roomsApi();
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
  FakeSocket.all = [];
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
  await AsyncStorage.clear();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as { WebSocket?: unknown }).WebSocket = originalSocket;
  jest.restoreAllMocks();
});

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
const posts = (path: string) =>
  requests
    .filter((r) => new URL(r.url).pathname === path && r.method !== 'GET')
    .map((r) => [r.method, r.body]);

async function openRoom() {
  const router = renderApp(appRoutes, { initialUrl: `/together/room/${ROOM_ID}` });
  await screen.findByRole('header', { name: 'Morning study' });
  return router;
}

describe('Focus rooms in Together (docs/05: Together → Focus rooms)', () => {
  it('lists open public rooms and joins one', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/together' });
    await shows('Focus rooms');
    const lobby = await screen.findByRole('button', { name: /^Morning study, 25 minutes, 1 of 4/ });
    fireEvent.press(lobby);
    await screen.findByRole('header', { name: 'Morning study' });
    expect(router.getPathname()).toBe(`/together/room/${ROOM_ID}`);
    expect(posts(`/rooms/${ROOM_ID}/join`)).toEqual([['POST', undefined]]);
  });

  it('lists the room the user is in once, never as a room to join', async () => {
    server.state.current = makeRoom();
    server.state.lobbies = [makeRoom()];
    renderApp(appRoutes, { initialUrl: '/together' });
    await screen.findByRole('button', { name: /You're in Morning study/ });
    expect(screen.queryByRole('button', { name: /^Morning study, 25 minutes/ })).toBeNull();
  });

  it('opens the room the user is already in', async () => {
    server.state.current = makeRoom();
    server.state.lobbies = [];
    const router = renderApp(appRoutes, { initialUrl: '/together' });
    fireEvent.press(await screen.findByRole('button', { name: /You're in Morning study/ }));
    await screen.findByRole('header', { name: 'Morning study' });
    expect(router.getPathname()).toBe(`/together/room/${ROOM_ID}`);
  });

  it('creates a room with a name, a length, a size, and who can join', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/together' });
    fireEvent.press(await screen.findByRole('button', { name: 'Create a room' }));
    await settleSheetTransitions();
    fireEvent.changeText(screen.getByLabelText('Room name'), '  Thesis sprint ');
    fireEvent.press(screen.getByRole('button', { name: '50 min' }));
    fireEvent.press(screen.getByRole('button', { name: 'Private' }));
    fireEvent.press(screen.getByRole('button', { name: 'Create room' }));
    await screen.findByRole('header', { name: 'Thesis sprint' });
    expect(router.getPathname()).toBe(`/together/room/${ROOM_ID}`);
    expect(server.state.created).toEqual([
      {
        name: 'Thesis sprint',
        topic: null,
        durationMinutes: 50,
        maxParticipants: 4,
        visibility: 'private',
      },
    ]);
  });

  it('joins with a code, and says why one cannot be used', async () => {
    renderApp(appRoutes, { initialUrl: '/together' });
    fireEvent.press(await screen.findByRole('button', { name: 'Join with a code' }));
    await settleSheetTransitions();
    server.state.joinAnswer = {
      status: 404,
      body: { ...nestError(404, 'This room does not exist.'), code: 'room_not_found' },
    };
    fireEvent.changeText(screen.getByLabelText('Room code'), 'zzz999');
    fireEvent.press(screen.getByRole('button', { name: 'Join room' }));
    await shows('No open room has that code.');
    server.state.joinAnswer = {
      status: 409,
      body: { ...nestError(409, 'This room is full.'), code: 'room_full' },
    };
    fireEvent.press(screen.getByRole('button', { name: 'Join room' }));
    await shows('That room is full.');
    // A7.2: too many codes tried.
    server.state.joinAnswer = {
      status: 429,
      body: {
        ...nestError(429, 'Too many attempts.'),
        code: 'rate_limited',
        retryAfterSeconds: 600,
      },
    };
    fireEvent.press(screen.getByRole('button', { name: 'Join room' }));
    await shows('Too many codes tried for now. Please wait a few minutes and try again.');
    server.state.joinAnswer = null;
    fireEvent.changeText(screen.getByLabelText('Room code'), 'abc234');
    fireEvent.press(screen.getByRole('button', { name: 'Join room' }));
    await screen.findByRole('header', { name: 'Morning study' });
    expect(posts('/rooms/join').at(-1)).toEqual(['POST', { code: 'ABC234' }]);
  });
});

describe('the lobby (docs/02 Focus Together: quick to get ready, no chat)', () => {
  it('shows who is there and ready, and the code to share', async () => {
    await openRoom();
    expect(screen.getByText('25 min · Exams')).toBeOnTheScreen();
    expect(screen.getByText('Code ABC234')).toBeOnTheScreen();
    expect(screen.getByText('Mai Anh (you) · Host · Not ready yet')).toBeOnTheScreen();
    expect(screen.getByText('Linh · Ready')).toBeOnTheScreen();
    // No chat of any kind (spec §14.3).
    expect(screen.queryByLabelText(/message|chat/i)).toBeNull();
  });

  it('gets ready once the user picks their own topic, and can step back', async () => {
    await openRoom();
    const ready = screen.getByRole('button', { name: "I'm ready" });
    expect(ready).toBeDisabled();
    fireEvent.press(await screen.findByRole('button', { name: 'Thesis' }));
    fireEvent.press(screen.getByRole('button', { name: "I'm ready" }));
    await shows('Mai Anh (you) · Host · Ready');
    fireEvent.press(screen.getByRole('button', { name: 'Not ready' }));
    await shows('Mai Anh (you) · Host · Not ready yet');
    expect(posts(`/rooms/${ROOM_ID}/ready`).map(([m]) => m)).toEqual(['PUT', 'DELETE']);
    expect(JSON.parse((await AsyncStorage.getItem(roomLinkKey(ME_ID)))!)).toMatchObject({
      roomId: ROOM_ID,
      topicId: TOPIC.id,
      sessionId: null,
    });
  });

  it('lets the host start with the people who are ready, and explains a refusal', async () => {
    server.state.startAnswer = {
      status: 409,
      body: {
        ...nestError(409, 'At least two people need to be ready to start.'),
        code: 'not_enough_ready',
      },
    };
    await openRoom();
    fireEvent.press(screen.getByRole('button', { name: 'Start now' }));
    await shows('At least two people need to be ready to start.');
  });

  it('offers Start only to the host', async () => {
    server.set({ you: { host: false, state: 'waiting' } });
    await openRoom();
    expect(screen.queryByRole('button', { name: 'Start now' })).toBeNull();
  });

  it('leaves quietly, back to Together', async () => {
    const router = await openRoom();
    fireEvent.press(screen.getByRole('button', { name: 'Leave room' }));
    await until(() => router.getPathname() === '/together');
    expect(posts(`/rooms/${ROOM_ID}/leave`)).toEqual([['POST', undefined]]);
  });

  it('follows the live channel: signs in with a message, then shows changes', async () => {
    await openRoom();
    await until(() => roomSockets().some((s) => s.sent.length >= 2));
    const socket = roomSockets().at(-1)!;
    expect(socket.url).toBe('wss://api.example.com/rooms/live');
    expect(socket.url).not.toContain('token');
    expect(socket.sent).toEqual([
      { type: 'auth', token: expect.any(String) },
      { type: 'watch', roomId: ROOM_ID },
    ]);
    socket.push({
      type: 'room',
      room: makeRoom({
        others: [
          { id: KAI.id, name: 'Linh', username: 'linh', state: 'ready' },
          { ...KAI, id: '0190a000-0000-7000-8000-00000000a003', state: 'waiting' },
        ],
      }),
    });
    await shows('Kai · Not ready yet');
  });

  it('ignores live messages about another room', async () => {
    await openRoom();
    await until(() => roomSockets().some((s) => s.sent.length >= 2));
    roomSockets()
      .at(-1)!
      .push({
        type: 'room',
        room: { ...makeRoom({ name: 'Another room' }), id: '0190b000-0000-7000-8000-00000000c002' },
      });
    // Query updates reach the screen on the next tick.
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 100)));
    expect(screen.getByRole('header', { name: 'Morning study' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Another room' })).toBeNull();
  });

  it('says so when the room is gone', async () => {
    server.state.room = null;
    renderApp(appRoutes, { initialUrl: `/together/room/${ROOM_ID}` });
    await shows('This room has ended.');
  });
});

describe('focusing together (a shared session is a focus session first)', () => {
  it('counts down to the server start time, and starts nothing before it', async () => {
    await AsyncStorage.setItem(
      roomLinkKey(ME_ID),
      JSON.stringify({ version: 1, roomId: ROOM_ID, topicId: TOPIC.id, sessionId: null }),
    );
    server.set({
      phase: 'countdown',
      startsAt: new Date(Date.now() + 9_500).toISOString(),
      you: { host: true, state: 'focusing' },
    });
    const router = await openRoom();
    await shows(/^Starting in \d+ s$/);
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
    expect(router.getPathname()).toBe(`/together/room/${ROOM_ID}`);
    expect(JSON.parse((await AsyncStorage.getItem(roomLinkKey(ME_ID)))!)).toMatchObject({
      sessionId: null,
    });
  });

  it('starts nothing once the start is more than ten minutes past (the room would not count it)', async () => {
    await AsyncStorage.setItem(
      roomLinkKey(ME_ID),
      JSON.stringify({ version: 1, roomId: ROOM_ID, topicId: TOPIC.id, sessionId: null }),
    );
    server.set({
      phase: 'focusing',
      startsAt: new Date(Date.now() - 11 * 60_000).toISOString(),
      you: { host: true, state: 'focusing' },
    });
    const router = await openRoom();
    await shows("This room started more than ten minutes ago, so this session can't join it.");
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
    expect(router.getPathname()).toBe(`/together/room/${ROOM_ID}`);
  });

  it('starts nothing for someone who was not in the session', async () => {
    await AsyncStorage.setItem(
      roomLinkKey(ME_ID),
      JSON.stringify({ version: 1, roomId: ROOM_ID, topicId: TOPIC.id, sessionId: null }),
    );
    server.set({
      phase: 'focusing',
      startsAt: new Date(Date.now() - 2_000).toISOString(),
      you: { host: false, state: 'waiting' },
    });
    const router = await openRoom();
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
    expect(router.getPathname()).toBe(`/together/room/${ROOM_ID}`);
  });

  it("starts the user's own timer at the start, then shows quiet presence while focusing", async () => {
    await AsyncStorage.setItem(
      roomLinkKey(ME_ID),
      JSON.stringify({ version: 1, roomId: ROOM_ID, topicId: TOPIC.id, sessionId: null }),
    );
    server.set({
      phase: 'focusing',
      startsAt: new Date(Date.now() - 2_000).toISOString(),
      durationMinutes: 50,
      you: { host: true, state: 'focusing' },
      others: [{ id: KAI.id, name: 'Linh', username: 'linh', state: 'focusing' }],
    });
    const router = renderApp(appRoutes, { initialUrl: `/together/room/${ROOM_ID}` });
    await until(() => router.getPathname() === '/focus');
    await shows('Focusing together · 2 people');
    // The room's length, on the user's own topic.
    expect(screen.getByText('50 min session')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Thesis' })).toBeOnTheScreen();
    const link = JSON.parse((await AsyncStorage.getItem(roomLinkKey(ME_ID)))!) as {
      sessionId: string | null;
    };
    expect(link.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('completes the room with the session the user saved, once, and celebrates quietly', async () => {
    await AsyncStorage.setItem(
      roomLinkKey(ME_ID),
      JSON.stringify({
        version: 1,
        roomId: ROOM_ID,
        topicId: TOPIC.id,
        sessionId: '0190d000-0000-7000-8000-00000000e001',
      }),
    );
    server.set({
      phase: 'focusing',
      startsAt: new Date(Date.now() - 26 * 60_000).toISOString(),
      you: { host: true, state: 'focusing' },
    });
    await openRoom();
    await shows('You focused together.');
    expect(screen.getByText('Focus Together')).toBeOnTheScreen();
    expect(posts(`/rooms/${ROOM_ID}/complete`)).toEqual([
      ['POST', { sessionId: '0190d000-0000-7000-8000-00000000e001' }],
    ]);
    expect(await AsyncStorage.getItem(roomLinkKey(ME_ID))).toBeNull();
  });

  it('waits for the session to be saved before completing', async () => {
    await AsyncStorage.setItem(
      roomLinkKey(ME_ID),
      JSON.stringify({
        version: 1,
        roomId: ROOM_ID,
        topicId: TOPIC.id,
        sessionId: '0190d000-0000-7000-8000-00000000e001',
      }),
    );
    server.state.completeAnswer = {
      status: 404,
      body: { ...nestError(404, 'This session does not exist.'), code: 'session_not_found' },
    };
    server.set({
      phase: 'focusing',
      startsAt: new Date(Date.now() - 26 * 60_000).toISOString(),
      you: { host: true, state: 'focusing' },
    });
    await openRoom();
    await until(() => posts(`/rooms/${ROOM_ID}/complete`).length === 1);
    await shows(/saving your session/i);
    expect(screen.queryByText('You focused together.')).toBeNull();
    // Kept for the next try.
    expect(await AsyncStorage.getItem(roomLinkKey(ME_ID))).not.toBeNull();
    expect(
      within(screen.getByTestId('room-status')).getByText(/saving your session/i),
    ).toBeOnTheScreen();
  });
});

const KAI_FRIEND = {
  ...person(KAI.id, 'Kai', 'kai'),
  relationship: { following: true, followedBy: true, friends: true },
};
const INVITE = {
  room: makeRoom({
    you: null,
    others: [{ ...KAI, host: true, state: 'ready' }],
    visibility: 'private',
  }),
  from: person(KAI.id, 'Kai', 'kai'),
  invitedAt: '2026-10-13T09:00:00.000Z',
};

describe('room invitations (M6.2; A6.3)', () => {
  it('invites friends from the lobby', async () => {
    // Linh is a friend too, but already in the room: only Kai is offered.
    server.state.following = [
      KAI_FRIEND,
      { ...person(LINH_ID, 'Linh', 'linh'), relationship: KAI_FRIEND.relationship },
    ];
    await openRoom();
    fireEvent.press(screen.getByRole('button', { name: 'Invite friends' }));
    await settleSheetTransitions();
    fireEvent.press(await screen.findByRole('button', { name: 'Kai' }));
    expect(screen.queryByRole('button', { name: 'Linh' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Send invitations' }));
    await shows('Invitations sent.');
    expect(posts(`/rooms/${ROOM_ID}/invites`)).toEqual([['POST', { userIds: [KAI.id] }]]);
  });

  it('offers no invitations once the room has started', async () => {
    server.set({
      phase: 'focusing',
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      you: { host: true, state: 'focusing' },
    });
    await openRoom();
    expect(screen.queryByRole('button', { name: 'Invite friends' })).toBeNull();
  });

  it('shows invitations in Together, and declines one', async () => {
    server.state.invites = [INVITE];
    renderApp(appRoutes, { initialUrl: '/together' });
    const row = await screen.findByText('Kai invited you to Morning study');
    expect(row).toBeOnTheScreen();
    fireEvent.press(
      screen.getByRole('button', { name: 'Decline the invitation to Morning study' }),
    );
    await until(() => screen.queryByText('Kai invited you to Morning study') === null);
    expect(posts(`/me/room-invites/${ROOM_ID}`)).toEqual([['DELETE', undefined]]);
  });

  it('opens an invited room, which can be joined there', async () => {
    server.state.invites = [INVITE];
    server.state.room = INVITE.room;
    const router = renderApp(appRoutes, { initialUrl: '/together' });
    fireEvent.press(await screen.findByRole('button', { name: 'Open Morning study' }));
    await screen.findByRole('header', { name: 'Morning study' });
    expect(router.getPathname()).toBe(`/together/room/${ROOM_ID}`);
    fireEvent.press(screen.getByRole('button', { name: 'Join room' }));
    await waitFor(() => expect(posts(`/rooms/${ROOM_ID}/join`)).toEqual([['POST', undefined]]));
    expect(await screen.findByRole('button', { name: "I'm ready" })).toBeOnTheScreen();
  });
});

describe('notification taps and links (M6.2; docs/05 §4)', () => {
  it('opens what a tapped notification links to', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: 'Start Focus' });
    await act(async () =>
      tapNotification({
        link: `/together/room/${ROOM_ID}`,
        category: 'focusRoomInvite',
        recipient: ME_ID,
      }),
    );
    await screen.findByRole('header', { name: 'Morning study' });
    expect(router.getPathname()).toBe(`/together/room/${ROOM_ID}`);
  });

  it('opens the link of the notification that launched the app, with a way back', async () => {
    launchFromNotification({
      link: `/together/room/${ROOM_ID}`,
      category: 'focusRoomInvite',
      recipient: ME_ID,
    });
    const router = renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Morning study' });
    expect(router.getPathname()).toBe(`/together/room/${ROOM_ID}`);
    act(() => expoRouter.back());
    await shows('Focus rooms');
    expect(router.getPathname()).toBe('/together');
  });

  it('waits for sign-in before opening a link tapped while signed out', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      deleteItemAsync: (key: string) => Promise<void>;
    };
    await secureStore.deleteItemAsync('focus-forest.session');
    launchFromNotification({
      link: `/together/room/${ROOM_ID}`,
      category: 'focusRoomInvite',
      recipient: ME_ID,
    });
    const router = renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('header', { name: WELCOME_TITLE });
    fireEvent.press(screen.getByRole('button', { name: 'I already have an account' }));
    await screen.findByRole('header', { name: 'Welcome back' });
    fireEvent.changeText(screen.getByLabelText('Email'), 'mai@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('header', { name: 'Morning study' });
    expect(router.getPathname()).toBe(`/together/room/${ROOM_ID}`);
  });

  async function signInAfterLaunch() {
    const secureStore = jest.requireMock('expo-secure-store') as {
      deleteItemAsync: (key: string) => Promise<void>;
    };
    await secureStore.deleteItemAsync('focus-forest.session');
    const router = renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('header', { name: WELCOME_TITLE });
    fireEvent.press(screen.getByRole('button', { name: 'I already have an account' }));
    await screen.findByRole('header', { name: 'Welcome back' });
    fireEvent.changeText(screen.getByLabelText('Email'), 'mai@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'correct horse');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('button', { name: 'Start Focus' });
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 200)));
    return router;
  }

  it('opens Home, not the link, when another account signs in after a tap', async () => {
    launchFromNotification({
      link: `/together/room/${ROOM_ID}`,
      category: 'focusRoomInvite',
      recipient: 'someone-else',
    });
    const router = await signInAfterLaunch();
    expect(router.getPathname()).toBe('/');
    expect(screen.queryByRole('header', { name: 'Morning study' })).toBeNull();
  });

  it('does not keep a link that names no account for whoever signs in next', async () => {
    launchFromNotification({ link: `/together/room/${ROOM_ID}`, category: 'focusRoomInvite' });
    const router = await signInAfterLaunch();
    expect(router.getPathname()).toBe('/');
  });

  it('opens Home for a tap meant for another account', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/together' });
    await shows('Focus rooms');
    await act(async () =>
      tapNotification({
        link: `/together/room/${ROOM_ID}`,
        category: 'focusRoomInvite',
        recipient: 'someone-else',
      }),
    );
    await screen.findByRole('button', { name: 'Start Focus' });
    expect(router.getPathname()).toBe('/');
  });

  it('still opens a link that names no account, tapped while signed in', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('button', { name: 'Start Focus' });
    await act(async () =>
      tapNotification({ link: `/together/room/${ROOM_ID}`, category: 'focusRoomInvite' }),
    );
    await screen.findByRole('header', { name: 'Morning study' });
    expect(router.getPathname()).toBe(`/together/room/${ROOM_ID}`);
  });

  it('opens Home for a link it does not know', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/together' });
    await shows('Focus rooms');
    await act(async () => tapNotification({ link: '/settings/danger', category: 'badgeUnlocked' }));
    await screen.findByRole('button', { name: 'Start Focus' });
    expect(router.getPathname()).toBe('/');
  });

  it('opens Home for an app link to nowhere', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/no/such/place' });
    await screen.findByRole('button', { name: 'Start Focus' });
    expect(router.getPathname()).toBe('/');
  });

  it('leaves the timer’s own notifications to the timer', async () => {
    const router = renderApp(appRoutes, { initialUrl: '/together' });
    await shows('Focus rooms');
    await act(async () =>
      // Another account's timer: the completion ignores it too (M2.12), so nothing moves.
      tapNotification({ kind: 'focus-timer', userId: 'someone-else', sessionId: 'x', link: '/' }),
    );
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 200)));
    expect(router.getPathname()).toBe('/together');
  });
});
