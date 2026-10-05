import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from 'expo-router/testing-library';

import { NetworkError, type FocusSession } from '../api';
import { completionReceiptsKey } from '../sessions/completion-receipts';
import { fakeFetch, type FakeRequest } from '../test-utils/api';
import { mockAppState } from '../test-utils/app-state';
import { makeCurrentTree, makeHome } from '../test-utils/core-loop';
import { makeHistoryItem } from '../test-utils/history';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { makeSessionResult } from '../test-utils/sessions';
import { settleSheetTransitions, until } from '../test-utils/sheets';

/**
 * X3.G: highlighting a session's note for its monthly recap, from the session's own screen
 * (Completion, which History opens). The server decides (PUT|DELETE …/note/highlight); the
 * screen shows only what it answered, never an optimistic state, and nothing is queued offline.
 */

jest.mock(
  'expo-secure-store',
  () => jest.requireActual('../test-utils/secure-store-mock').secureStoreMock,
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.1.0' } },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

const mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

const API = 'https://api.example.com';
const USER = 'user-1';
const OTHER = 'user-2';
const ID = '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6';
const NOTE = 'Chapter 4 finally clicked.';
const HIGHLIGHT = 'Highlight in monthly recap';
const REMOVE = 'Remove from monthly recap';
const HIGHLIGHTED = 'Highlighted. It is kept in the monthly recap when the month ends.';

type Reply = { status: number; body?: unknown } | Error;

/** The A2.6/A3.4 session note rules, as the server applies them. */
function noteApi(initial: FocusSession) {
  const state = {
    session: initial,
    offline: false,
    /** The note was cleared on another device: the server's note is null. */
    clearedElsewhere: false,
    failWith: null as Reply | null,
  };
  const handler = ({ url, method, body }: FakeRequest): Reply => {
    const { pathname, searchParams } = new URL(url);
    const ok = (b: unknown): Reply => ({ status: 200, body: b });
    if (pathname === '/me/preferences') return ok(makePreferences({ reducedMotion: true }));
    if (state.offline) return new NetworkError();
    if (state.clearedElsewhere) {
      state.session = { ...state.session, note: null, noteHighlighted: false };
    }
    if (pathname === '/session-rules')
      return ok({ version: 1, minValidMinutes: 5, maxPauseMinutes: 30 });
    if (pathname === '/me/topics') return ok([]);
    if (pathname === '/me/home') return ok(makeHome());
    if (pathname === '/me/trees/current') return ok(makeCurrentTree());
    if (pathname === '/me/sessions') {
      const from = searchParams.get('from');
      const listed = !from || from === state.session.localDate;
      return ok({
        items: listed ? [makeHistoryItem({ ...state.session })] : [],
        nextCursor: null,
      });
    }
    if (pathname === `/me/sessions/${ID}/note` && method === 'PATCH') {
      const note = (body as { note: string | null }).note;
      state.session = {
        ...state.session,
        note,
        noteHighlighted: note === null ? false : state.session.noteHighlighted,
      };
      return ok(state.session);
    }
    if (pathname === `/me/sessions/${ID}/note/highlight`) {
      if (state.failWith) return state.failWith;
      if (method === 'PUT') {
        if (state.session.note === null) {
          return {
            status: 422,
            body: {
              statusCode: 422,
              code: 'note_required',
              message: 'Add a note before highlighting it.',
            },
          };
        }
        state.session = { ...state.session, noteHighlighted: true };
      } else {
        state.session = { ...state.session, noteHighlighted: false };
      }
      return ok(state.session);
    }
    return { status: 500, body: { statusCode: 500, message: 'Not in this test.' } };
  };
  return { handler, state };
}

let server: ReturnType<typeof noteApi>;
let requests: FakeRequest[];
const originalFetch = globalThis.fetch;

async function open(
  session: FocusSession,
  { owner = USER, signedIn = USER }: { owner?: string; signedIn?: string } = {},
) {
  await AsyncStorage.setItem(
    completionReceiptsKey(owner),
    JSON.stringify({ version: 1, receipts: [session] }),
  );
  signInForTest({ id: signedIn, email: `${signedIn}@example.com` });
  server = noteApi(session);
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
  renderApp(appRoutes, { initialUrl: `/completion/${ID}` });
}

const session = (overrides: Partial<FocusSession> = {}) =>
  makeSessionResult({ id: ID, note: NOTE, noteHighlighted: false, ...overrides });
const highlightCalls = () => requests.filter((r) => r.url.endsWith('/note/highlight'));
const pause = (ms = 300) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = API;
  await AsyncStorage.clear();
  mockAppState();
});
afterEach(async () => {
  await settleSheetTransitions();
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('highlighting a session note for the monthly recap', () => {
  it('offers to highlight a saved note that is not highlighted', async () => {
    await open(session());
    expect(await screen.findByRole('button', { name: HIGHLIGHT })).toBeOnTheScreen();
    expect(screen.queryByText(HIGHLIGHTED)).toBeNull();
  });

  it('highlights, then removes the highlight, each time showing the server’s answer', async () => {
    await open(session());
    fireEvent.press(await screen.findByRole('button', { name: HIGHLIGHT }));
    expect(await screen.findByRole('button', { name: REMOVE })).toBeOnTheScreen();
    expect(screen.getByText(HIGHLIGHTED)).toBeOnTheScreen();
    expect(highlightCalls().map((r) => r.method)).toEqual(['PUT']);

    fireEvent.press(screen.getByRole('button', { name: REMOVE }));
    expect(await screen.findByRole('button', { name: HIGHLIGHT })).toBeOnTheScreen();
    expect(screen.queryByText(HIGHLIGHTED)).toBeNull();
    expect(highlightCalls().map((r) => r.method)).toEqual(['PUT', 'DELETE']);
    // The live session only: no recap, tree, or forest request.
    expect(requests.some((r) => /\/me\/(trees|forest)\/?\d/.test(r.url))).toBe(false);
  });

  it('offers nothing without a saved note, or while a typed note is not on the server yet', async () => {
    await open(session({ note: null }));
    await screen.findByRole('header', { name: 'Focus session saved' });
    await pause();
    expect(screen.queryByRole('button', { name: HIGHLIGHT })).toBeNull();

    fireEvent.changeText(screen.getByLabelText('Note'), 'Something new');
    await pause();
    expect(screen.queryByRole('button', { name: HIGHLIGHT })).toBeNull();
  });

  it('hides the control for a typed change until it is saved', async () => {
    await open(session());
    await screen.findByRole('button', { name: HIGHLIGHT });
    fireEvent.changeText(screen.getByLabelText('Note'), `${NOTE} More.`);
    expect(screen.queryByRole('button', { name: HIGHLIGHT })).toBeNull();
  });

  it('follows the server when the note is cleared: no highlight is left', async () => {
    await open(session({ noteHighlighted: true }));
    await screen.findByRole('button', { name: REMOVE });
    fireEvent.changeText(screen.getByLabelText('Note'), '');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));
    await until(() => server.state.session.note === null);
    await until(() => screen.queryByRole('button', { name: REMOVE }) === null);
    expect(screen.queryByText(HIGHLIGHTED)).toBeNull();
    expect(screen.queryByRole('button', { name: HIGHLIGHT })).toBeNull();
  });

  it('says a connection is needed offline, and changes nothing', async () => {
    await open(session());
    await screen.findByRole('button', { name: HIGHLIGHT });
    server.state.offline = true;
    fireEvent.press(screen.getByRole('button', { name: HIGHLIGHT }));
    expect(
      await screen.findByText('Highlighting needs a connection. Nothing was changed.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: HIGHLIGHT })).toBeOnTheScreen();
    expect(screen.queryByText(HIGHLIGHTED)).toBeNull();
    // The one attempt the press made; nothing is queued, so back online nothing is sent by itself.
    expect(highlightCalls()).toHaveLength(1);
    server.state.offline = false;
    await pause();
    expect(highlightCalls()).toHaveLength(1);
  });

  it('on a refusal, shows the server’s truth again, calmly, without its code', async () => {
    await open(session());
    await screen.findByRole('button', { name: HIGHLIGHT });
    server.state.clearedElsewhere = true;
    fireEvent.press(screen.getByRole('button', { name: HIGHLIGHT }));
    expect(
      await screen.findByText("This note couldn't be highlighted. Nothing was changed."),
    ).toBeOnTheScreen();
    // The session as the server has it now: its note was cleared, so there is nothing to offer.
    await until(() => screen.queryByRole('button', { name: HIGHLIGHT }) === null);
    expect(screen.queryByText(/note_required|Add a note before/)).toBeNull();
    expect(screen.queryByText(HIGHLIGHTED)).toBeNull();
  });

  it('keeps the server’s state when an error answers', async () => {
    await open(session({ noteHighlighted: true }));
    await screen.findByRole('button', { name: REMOVE });
    server.state.failWith = { status: 500, body: { statusCode: 500, message: 'boom' } };
    fireEvent.press(screen.getByRole('button', { name: REMOVE }));
    await screen.findByText("The highlight couldn't be removed. Nothing was changed.");
    expect(screen.getByRole('button', { name: REMOVE })).toBeOnTheScreen();
    expect(screen.getByText(HIGHLIGHTED)).toBeOnTheScreen();
    expect(screen.queryByText(/boom|500/)).toBeNull();
  });

  it('is reached from History: the listed session’s state, then the server’s answer', async () => {
    signInForTest({ id: USER, email: 'mai@example.com' });
    server = noteApi(session());
    const net = fakeFetch(server.handler);
    requests = net.requests;
    globalThis.fetch = net.fetch;
    renderApp(appRoutes, { initialUrl: '/insights' });
    const rows = await screen.findAllByA11yHint('Opens this session.');
    fireEvent.press(rows[0]!);
    fireEvent.press(await screen.findByRole('button', { name: HIGHLIGHT }));
    expect(await screen.findByText(HIGHLIGHTED)).toBeOnTheScreen();
    expect(server.state.session.noteHighlighted).toBe(true);
  });

  it('never shows another user’s session, so it cannot be highlighted from here', async () => {
    await open(session(), { owner: USER, signedIn: OTHER });
    await screen.findByText("This session isn't on this device.");
    expect(screen.queryByRole('button', { name: HIGHLIGHT })).toBeNull();
  });
});
