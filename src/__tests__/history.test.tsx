import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { NetworkError, type FocusSession } from '../api';
import type { SessionHistoryItem } from '../api/history';
import { formatLocalDate } from '../history/history-format';
import { historySnapshotKey } from '../history/history-snapshot-store';
import { sessionNoteOutboxKey } from '../sessions/session-note-outbox';
import { sessionOutboxKey } from '../sessions/session-outbox';
import { activeTimerKey } from '../timer/active-timer-store';
import { deviceClock } from '../timer/app-timer-store';
import type { TimerState } from '../timer/timer-engine';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { mockAppState } from '../test-utils/app-state';
import { makeHistoryItem } from '../test-utils/history';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { makeSessionResult } from '../test-utils/sessions';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { makeTopic } from '../test-utils/topics';

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
const MINUTE = 60_000;
const idOf = (n: number) => `0192f1a2-3b4c-7d5e-8f60-${String(n).padStart(12, '0')}`;
const topicOf = (n: number) => `5d1c3f5e-2a4b-4c6d-8e7f-${String(n).padStart(12, '0')}`;

const writing = {
  id: topicOf(1),
  name: 'Writing',
  icon: 'pen',
  color: 'topic.4',
  status: 'active' as const,
};
const algebra = {
  id: topicOf(2),
  name: 'Algebra',
  icon: 'calc',
  color: 'topic.7',
  status: 'archived' as const,
};
const music = {
  id: topicOf(3),
  name: 'Music',
  icon: 'note',
  color: 'topic.2',
  status: 'active' as const,
};

/**
 * Server order (startedAt DESC, id DESC), deliberately not alphabetical and not in date order
 * by day: after a time zone change the persisted day of the first session is the 29th, while
 * the next one's is the 30th.
 */
const FIXTURE: SessionHistoryItem[] = [
  makeHistoryItem({
    id: idOf(7),
    topicId: writing.id,
    topic: writing,
    localDate: '2026-09-29',
    startedAt: '2026-09-30T09:00:00.000Z',
    plannedMinutes: 25,
    focusedMilliseconds: 23 * MINUTE,
    status: 'ended_early',
    counted: true,
    note: 'Draft of chapter two',
  }),
  makeHistoryItem({
    id: idOf(3),
    topicId: algebra.id,
    topic: algebra,
    // 12:00 UTC on the 29th: the 29th on this device, the 30th where the user was.
    localDate: '2026-09-30',
    startedAt: '2026-09-29T12:00:00.000Z',
    plannedMinutes: 50,
    focusedMilliseconds: 50 * MINUTE,
    status: 'completed',
    counted: true,
    note: null,
  }),
  makeHistoryItem({
    id: idOf(5),
    topicId: music.id,
    topic: music,
    localDate: '2026-09-29',
    startedAt: '2026-09-29T08:00:00.000Z',
    plannedMinutes: 25,
    focusedMilliseconds: 3 * MINUTE,
    status: 'discarded',
    counted: false,
    note: null,
  }),
];

/**
 * GET /me/sessions pages the server's list by an opaque cursor; PUT and PATCH behave as A2.5
 * and A2.6. `down` fails every history request; `nextPageDown` fails only pages after the
 * first; `repeatAcrossPages` makes the second page start with the first page's last item.
 */
function historyApi(initial: SessionHistoryItem[]) {
  const state = {
    items: [...initial],
    down: false,
    sessionsDown: false,
    nextPageDown: false,
    repeatAcrossPages: false,
    hold: null as Promise<void> | null,
  };
  const handler = async ({ url, method, body }: FakeRequest) => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/me/preferences')
      return { status: 200, body: makePreferences({ reducedMotion: true }) };
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics') return { status: 200, body: [makeTopic({ ...writing })] };
    if (pathname === '/me/sessions' && method === 'GET') {
      if (state.hold) await state.hold;
      if (state.down) return new NetworkError();
      const cursor = searchParams.get('cursor');
      if (cursor !== null && state.nextPageDown) return new NetworkError();
      const limit = Number(searchParams.get('limit'));
      let start = cursor === null ? 0 : Number(cursor.replace('opaque:', ''));
      if (cursor !== null && state.repeatAcrossPages) start -= 1;
      const items = state.items.slice(start, start + limit);
      const end = start + limit;
      return {
        status: 200,
        body: { items, nextCursor: end < state.items.length ? `opaque:${end}` : null },
      };
    }
    const [, , resource, id = '', tail] = pathname.split('/');
    if (resource === 'sessions') {
      if (state.sessionsDown) return new NetworkError();
      if (method === 'PUT') {
        const payload = body as { topicId: string; startedAt: string; endedAt: string };
        const stored = makeSessionResult({
          id,
          topicId: payload.topicId,
          startedAt: payload.startedAt,
          endedAt: payload.endedAt,
          status: 'completed',
        });
        state.items.unshift(
          makeHistoryItem({ ...stored, topic: writing, localDate: '2026-10-01' }),
        );
        return { status: 201, body: stored };
      }
      if (method === 'PATCH' && tail === 'note') {
        const item = state.items.find((candidate) => candidate.id === id);
        if (!item) return { status: 404, body: nestError(404, 'Session not found.') };
        item.note = (body as { note: string | null }).note;
        const { topic: _topic, ...session } = item;
        return { status: 200, body: session satisfies FocusSession };
      }
    }
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
  return { handler, state };
}

let server: ReturnType<typeof historyApi>;
let requests: FakeRequest[];
let appState: ReturnType<typeof mockAppState>;
let clock = 0;
const originalFetch = globalThis.fetch;

function serve() {
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
}

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = API;
  mockWindow.fontScale = 1;
  await AsyncStorage.clear();
  signInForTest();
  server = historyApi(FIXTURE);
  serve();
  clock = Date.now();
  jest.spyOn(deviceClock, 'now').mockImplementation(() => clock);
  appState = mockAppState();
});
afterEach(async () => {
  await settleSheetTransitions();
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const historyGets = () =>
  requests.filter((r) => r.method === 'GET' && new URL(r.url).pathname === '/me/sessions');
const dayHeaders = () =>
  screen
    .getAllByRole('header')
    .map((node) => node.props.children as unknown)
    .filter((text): text is string => typeof text === 'string' && /\d{4}$/.test(text));
/** Waits for something stored on the device. */
async function untilStored(key: string, check: (raw: string) => boolean = () => true) {
  for (let i = 0; i < 200; i += 1) {
    let raw: string | null = null;
    await act(async () => {
      raw = await AsyncStorage.getItem(key);
    });
    if (raw !== null && check(raw)) return;
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
  }
  throw new Error(`Nothing stored under ${key}.`);
}
const rowNames = () =>
  screen
    .getAllByRole('button')
    .map((node) => node.props.accessibilityLabel as string | undefined)
    .filter((label): label is string => !!label && /min(,|$)/.test(label));
const rowFor = (topic: string) => screen.getByRole('button', { name: new RegExp(`^${topic}, `) });

async function openHistory() {
  renderApp(appRoutes, { initialUrl: '/insights' });
  await screen.findByRole('button', { name: /^Writing, / });
}

describe('Focus history in Insights', () => {
  it('shows a loading skeleton while the first page is on its way', async () => {
    let release: () => void = () => undefined;
    server.state.hold = new Promise<void>((resolve) => (release = resolve));
    renderApp(appRoutes, { initialUrl: '/insights' });

    expect(await screen.findByLabelText('Loading your focus history')).toBeOnTheScreen();
    await act(async () => release());
    expect(await screen.findByRole('button', { name: /^Writing, / })).toBeOnTheScreen();
  });

  it('groups by the persisted day, in the order the server sent, rows in server order', async () => {
    await openHistory();

    expect(screen.getByRole('header', { name: 'Insights' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Focus history' })).toBeOnTheScreen();
    expect(dayHeaders()).toEqual([formatLocalDate('2026-09-29'), formatLocalDate('2026-09-30')]);
    const names = rowNames();
    expect(names.map((name) => name.split(',')[0])).toEqual(['Writing', 'Music', 'Algebra']);
    // Algebra started on the 29th in this device's zone, but its day is the 30th.
    const sep30 = screen.getByTestId('history-day-2026-09-30');
    expect(within(sep30).getByRole('button', { name: /^Algebra, / })).toBeOnTheScreen();
    expect(requests.some((r) => r.url.includes('limit=100'))).toBe(false);
  });

  it("shows each row's topic, the server's focused time, and a calm outcome", async () => {
    await openHistory();

    // 23 minutes focused of 25 planned: the server's focused time, never the plan.
    expect(rowFor('Writing').props.accessibilityLabel).toMatch(/Ended early, 23 min$/);
    // An archived topic reads like any other.
    expect(rowFor('Algebra').props.accessibilityLabel).toMatch(/Completed, 50 min$/);
    expect(rowFor('Music').props.accessibilityLabel).toMatch(/Not counted, 3 min$/);
    expect(screen.queryByText(/fail|lost|wast|abandon|archived/i)).toBeNull();
  });

  it('shows the Insights empty state when there are no sessions yet', async () => {
    server = historyApi([]);
    serve();
    renderApp(appRoutes, { initialUrl: '/insights' });

    expect(
      await screen.findByText('Your focus story begins with your first session.'),
    ).toBeOnTheScreen();
  });

  it('offers a retry when nothing is known yet, and loads on retry', async () => {
    server.state.down = true;
    renderApp(appRoutes, { initialUrl: '/insights' });

    expect(
      await screen.findByText("We couldn't load your focus history right now.", undefined, {
        timeout: 10_000,
      }),
    ).toBeOnTheScreen();
    server.state.down = false;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: /^Writing, / })).toBeOnTheScreen();
  });

  it('keeps the history saved on this device visible when a later launch is offline', async () => {
    const first = renderApp(appRoutes, { initialUrl: '/insights' });
    await screen.findByRole('button', { name: /^Writing, / });
    await untilStored(historySnapshotKey(USER));
    first.unmount();

    server.state.down = true;
    renderApp(appRoutes, { initialUrl: '/insights' });

    expect(await screen.findByRole('button', { name: /^Writing, / })).toBeOnTheScreen();
    expect(
      await screen.findByText('Showing history saved on this device.', undefined, {
        timeout: 10_000,
      }),
    ).toBeOnTheScreen();
    expect(rowNames()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Load more sessions' })).toBeNull();
  });
});

describe('pages', () => {
  const many = Array.from({ length: 35 }, (_, i) =>
    makeHistoryItem({
      id: idOf(100 - i),
      topicId: writing.id,
      topic: { ...writing, name: `Topic ${String.fromCharCode(90 - (i % 26))}${i}` },
      localDate: '2026-09-20',
    }),
  );

  it('asks for the next page only on request, appends it in order, and stops at the end', async () => {
    server = historyApi(many);
    serve();
    renderApp(appRoutes, { initialUrl: '/insights' });
    await screen.findByRole('button', { name: /^Topic Z0, / });
    expect(rowNames()).toHaveLength(30);
    expect(historyGets()).toHaveLength(1);
    expect(new URL(historyGets()[0]!.url).searchParams.get('limit')).toBe('30');

    fireEvent.press(screen.getByRole('button', { name: 'Load more sessions' }));

    await until(() => rowNames().length === 35);
    expect(new URL(historyGets()[1]!.url).searchParams.get('cursor')).toBe('opaque:30');
    expect(rowNames().map((name) => name.split(',')[0])).toEqual(
      many.map((item) => item.topic.name),
    );
    expect(screen.queryByRole('button', { name: 'Load more sessions' })).toBeNull();
  });

  it('never shows a session twice when pages overlap', async () => {
    server = historyApi(many);
    server.state.repeatAcrossPages = true;
    serve();
    renderApp(appRoutes, { initialUrl: '/insights' });
    await screen.findByRole('button', { name: /^Topic Z0, / });

    fireEvent.press(screen.getByRole('button', { name: 'Load more sessions' }));

    await until(() => historyGets().length === 2);
    await until(() => rowNames().length === 35);
    expect(new Set(rowNames()).size).toBe(35);
  });

  it('keeps the loaded pages when the next one fails, and retries it', async () => {
    server = historyApi(many);
    serve();
    renderApp(appRoutes, { initialUrl: '/insights' });
    await screen.findByRole('button', { name: /^Topic Z0, / });
    server.state.nextPageDown = true;

    fireEvent.press(screen.getByRole('button', { name: 'Load more sessions' }));

    expect(
      await screen.findByText("We couldn't load more sessions right now.", undefined, {
        timeout: 10_000,
      }),
    ).toBeOnTheScreen();
    expect(rowNames()).toHaveLength(30);

    server.state.nextPageDown = false;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await until(() => rowNames().length === 35);
  });
});

describe('a session that syncs', () => {
  const endedEarly = (): TimerState => ({
    version: 1,
    id: '0192f1a2-3b4c-7d5e-8f60-aaaaaaaaaaaa',
    topicId: writing.id,
    plannedMinutes: 25,
    rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
    startedAt: clock - 20 * MINUTE,
    pauses: [],
    pausedAt: null,
    finished: { at: clock - 8 * MINUTE, reason: 'ended' },
  });

  it('refreshes the history once the server has it, without making up a row before', async () => {
    await AsyncStorage.setItem(activeTimerKey(USER), JSON.stringify(endedEarly()));
    server.state.sessionsDown = true;
    renderApp(appRoutes, { initialUrl: '/insights' });
    await screen.findByRole('button', { name: /^Writing, / });
    await untilStored(sessionOutboxKey(USER), (raw) => raw.includes('aaaaaaaaaaaa'));
    expect(rowNames()).toHaveLength(3);
    const before = historyGets().length;

    server.state.sessionsDown = false;
    await appState.emit('background');
    await appState.emit('active');

    await until(() => historyGets().length > before);
    await until(() => rowNames().length === 4);
  });

  it('keeps the session synced when the history cannot be refreshed', async () => {
    await AsyncStorage.setItem(activeTimerKey(USER), JSON.stringify(endedEarly()));
    server.state.sessionsDown = true;
    renderApp(appRoutes, { initialUrl: '/insights' });
    await screen.findByRole('button', { name: /^Writing, / });
    await untilStored(sessionOutboxKey(USER), (raw) => raw.includes('aaaaaaaaaaaa'));
    const before = historyGets().length;

    server.state.sessionsDown = false;
    server.state.down = true;
    await appState.emit('background');
    await appState.emit('active');

    await until(() => historyGets().length > before);
    await untilStored(sessionOutboxKey(USER), (raw) => raw.includes('"items":[]'));
    expect(rowNames()).toHaveLength(3);
  });
});

describe('opening a session from history', () => {
  it('opens a synced session the device has no receipt for, as the server has it', async () => {
    await openHistory();

    fireEvent.press(rowFor('Writing'));

    expect(await screen.findByRole('header', { name: 'Focus session saved' })).toBeOnTheScreen();
    expect(screen.getByText('23 min focused')).toBeOnTheScreen();
    expect(screen.getByText('Writing')).toBeOnTheScreen();
    expect(screen.getByLabelText('Note').props.value).toBe('Draft of chapter two');
    expect(screen.queryByText("This session isn't on this device.")).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('header', { name: 'Focus history' })).toBeOnTheScreen();
  });

  it('opens an archived topic’s session with its name from the history item', async () => {
    await openHistory();

    fireEvent.press(rowFor('Algebra'));

    expect(await screen.findByRole('header', { name: 'Session complete' })).toBeOnTheScreen();
    expect(screen.getByText('Algebra')).toBeOnTheScreen();
  });

  it('opens a saved session offline, and queues a note edit on the device', async () => {
    const first = renderApp(appRoutes, { initialUrl: '/insights' });
    await screen.findByRole('button', { name: /^Writing, / });
    await untilStored(historySnapshotKey(USER));
    first.unmount();
    server.state.down = true;
    server.state.sessionsDown = true;
    renderApp(appRoutes, { initialUrl: '/insights' });

    fireEvent.press(await screen.findByRole('button', { name: /^Music, / }));

    expect(await screen.findByRole('header', { name: 'Focus session saved' })).toBeOnTheScreen();
    expect(screen.getByText('3 min focused')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Note'), 'Scales');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Note saved on this device.')).toBeOnTheScreen();
  });

  it('shows a newer note still waiting on the device over the server’s note', async () => {
    await AsyncStorage.setItem(
      sessionNoteOutboxKey(USER),
      JSON.stringify({
        version: 1,
        items: [
          {
            sessionId: idOf(7),
            note: 'Newer words',
            revision: 1,
            state: 'pending',
            reason: null,
            savedAt: 1,
          },
        ],
      }),
    );
    server.state.sessionsDown = true;
    await openHistory();

    fireEvent.press(rowFor('Writing'));

    await screen.findByRole('header', { name: 'Focus session saved' });
    expect(screen.getByLabelText('Note').props.value).toBe('Newer words');
    expect(screen.getByText('Note saved on this device.')).toBeOnTheScreen();
  });

  it('says calmly when a note needs attention, and a new edit can be sent again', async () => {
    await AsyncStorage.setItem(
      sessionNoteOutboxKey(USER),
      JSON.stringify({
        version: 1,
        items: [
          {
            sessionId: idOf(7),
            note: 'Refused words',
            revision: 1,
            state: 'needs_attention',
            reason: 'rejected',
            savedAt: 1,
          },
        ],
      }),
    );
    await openHistory();
    fireEvent.press(rowFor('Writing'));
    await screen.findByRole('header', { name: 'Focus session saved' });

    expect(
      screen.getByText(
        'This note is still saved on this device and needs attention before it can sync.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/rejected|invalid_response|400/)).toBeNull();

    fireEvent.changeText(screen.getByLabelText('Note'), 'Better words');
    fireEvent.press(screen.getByRole('button', { name: 'Save note' }));

    await until(
      () => server.state.items.find((item) => item.id === idOf(7))?.note === 'Better words',
    );
  });
});

describe('accessibility', () => {
  it('gives each day its own heading and each row its own name', async () => {
    await openHistory();

    for (const day of ['2026-09-29', '2026-09-30']) {
      expect(screen.getByRole('header', { name: formatLocalDate(day) })).toBeOnTheScreen();
      // A day is not one giant element: its rows are separate buttons.
      expect(screen.getByTestId(`history-day-${day}`).props.accessible).not.toBe(true);
    }
    expect(rowFor('Music').props.accessibilityLabel).toMatch(/^Music, .+Not counted, 3 min$/);
  });

  it('keeps day headings, topics, and durations reachable at 200% text', async () => {
    mockWindow.fontScale = 2;
    await openHistory();

    expect(screen.getByRole('header', { name: formatLocalDate('2026-09-30') })).toBeOnTheScreen();
    expect(screen.getByText('Algebra')).toBeOnTheScreen();
    expect(screen.getByText('50 min')).toBeOnTheScreen();
    expect(screen.getByTestId('screen-scroll')).toBeOnTheScreen();
  });
});
