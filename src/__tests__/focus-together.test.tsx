import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { NetworkError, type HomeResponse } from '../api';
import { roomLinkKey } from '../rooms/room-links';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { makeCurrentTree, makeHome } from '../test-utils/core-loop';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { KAI, makeRoom, ME_ID, ROOM_ID, type RoomFixture } from '../test-utils/rooms';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { makeTopic } from '../test-utils/topics';
import { treeDto } from '../test-utils/trees';

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
  };
  const set = (fixture: RoomFixture) => {
    state.room = makeRoom(fixture);
    return state.room;
  };
  const handler = ({ url, method, body }: FakeRequest): Reply | Promise<Reply> => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
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
    if (pathname === '/me/following' || pathname === '/me/followers')
      return { status: 200, body: { items: [], nextCursor: null } };
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
    await until(() => FakeSocket.all.some((s) => s.sent.length >= 2));
    const socket = FakeSocket.all.at(-1)!;
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
    await until(() => FakeSocket.all.some((s) => s.sent.length >= 2));
    FakeSocket.all.at(-1)!.push({
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
