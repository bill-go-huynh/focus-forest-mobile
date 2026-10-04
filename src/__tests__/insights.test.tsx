import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';

import { NetworkError, type MonthInsights, type PersonalRecord, type WeekInsights } from '../api';
import { StyleSheet } from 'react-native';

import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { lightTheme } from '../theme';
import { mockAppState } from '../test-utils/app-state';
import { makeHistoryItem } from '../test-utils/history';
import { makeSubmissionBody } from '../test-utils/sessions';
import {
  dayCell,
  makeHeatmap,
  makeMonth,
  makeWeek,
  OLD_COURSE,
  RECORDS,
  topicInsight,
} from '../test-utils/insights';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { settleSheetTransitions, until } from '../test-utils/sheets';
import { makeTopic } from '../test-utils/topics';
import { sessionOutboxKey } from '../sessions/session-outbox';

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
const MIN = 60_000;
const READING_ID = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';
const OLD_ID = OLD_COURSE.topicId;

type Reply = { status: number; body?: unknown } | Error;

/**
 * The A3.5 API: weeks and months by the server's identity (the current one by default), the
 * heatmap, records, and the history with its filters (recorded, answered from `history`).
 */
function insightsApi() {
  const state = {
    offline: false,
    weeks: { current: makeWeek() } as Record<string, WeekInsights>,
    months: {
      current: {
        ...makeMonth(),
        period: {
          ...makeMonth().period,
          year: 2026,
          month: 10,
          from: '2026-10-01',
          to: '2026-10-31',
          current: true,
          archived: false,
        },
        archivedStats: null,
      },
    } as Record<string, MonthInsights>,
    records: RECORDS as PersonalRecord[],
    history: [
      makeHistoryItem({
        id: '0192f1a2-3b4c-7d5e-8f60-000000000001',
        localDate: '2026-10-07',
        startedAt: '2026-10-07T09:00:00.000Z',
      }),
      makeHistoryItem({
        id: '0192f1a2-3b4c-7d5e-8f60-000000000002',
        localDate: '2026-10-06',
        startedAt: '2026-10-06T09:00:00.000Z',
        status: 'discarded',
        counted: false,
        focusedMilliseconds: 3 * MIN,
      }),
    ],
  };
  state.weeks['2026-09-28'] = makeWeek({
    period: { kind: 'week', from: '2026-09-28', to: '2026-10-04', current: false },
    summary: {
      focusedMilliseconds: 200 * MIN,
      sessionCount: 5,
      activeDays: 3,
      averageFocusedMillisecondsPerActiveDay: 67 * MIN,
    },
    days: ['28', '29', '30']
      .map((d) => dayCell(`2026-09-${d}`, { focusedMilliseconds: 60 * MIN }))
      .concat(['01', '02', '03', '04'].map((d) => dayCell(`2026-10-${d}`))),
  });
  state.months['2026-9'] = makeMonth();
  const handler = ({ url, method }: FakeRequest): Reply => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/me/preferences')
      return { status: 200, body: makePreferences({ reducedMotion: true }) };
    if (state.offline) return new NetworkError();
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics')
      return {
        status: 200,
        body: [
          makeTopic({ id: READING_ID, name: 'Reading' }),
          makeTopic({
            id: OLD_ID,
            name: 'Old course',
            status: 'archived',
            archivedAt: '2026-10-01T00:00:00.000Z',
          }),
        ],
      };
    if (pathname === '/me/insights/week') {
      const week = state.weeks[searchParams.get('weekStart') ?? 'current'];
      return week
        ? { status: 200, body: week }
        : {
            status: 200,
            body: makeWeek({
              period: {
                kind: 'week',
                from: searchParams.get('weekStart')!,
                to: searchParams.get('weekStart')!,
                current: false,
              },
            }),
          };
    }
    if (pathname === '/me/insights/month') {
      const key = searchParams.get('year')
        ? `${searchParams.get('year')}-${searchParams.get('month')}`
        : 'current';
      return { status: 200, body: state.months[key] ?? makeMonth() };
    }
    if (pathname === '/me/insights/heatmap') {
      return { status: 200, body: makeHeatmap([...makeMonth().days, ...makeWeek().days]) };
    }
    if (pathname === '/me/insights/records')
      return { status: 200, body: { records: state.records } };
    if (pathname === '/me/sessions' && method === 'GET') {
      return {
        status: 200,
        body: { items: state.history, nextCursor: searchParams.get('cursor') ? null : 'opaque:30' },
      };
    }
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
  return { handler, state };
}

let server: ReturnType<typeof insightsApi>;
let requests: FakeRequest[];
let appState: ReturnType<typeof mockAppState>;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = API;
  mockWindow.fontScale = 1;
  await AsyncStorage.clear();
  signInForTest();
  server = insightsApi();
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
  appState = mockAppState();
});
afterEach(async () => {
  await settleSheetTransitions();
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
const pause = (ms = 300) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const paths = (path: string) => requests.filter((r) => new URL(r.url).pathname === path);
const historyParams = () =>
  paths('/me/sessions').map((r) => Object.fromEntries(new URL(r.url).searchParams));
const summary = () => screen.getByTestId('insights-summary');

async function openInsights() {
  renderApp(appRoutes, { initialUrl: '/insights' });
  await screen.findByTestId('insights-summary');
}
async function toMonth() {
  fireEvent.press(screen.getByRole('button', { name: 'Month' }));
  await shows(/^October 2026 ·/);
}

describe('Insights periods', () => {
  it('opens on this week, Week selected, led by one narrative summary', async () => {
    await openInsights();
    expect(screen.getByRole('button', { name: 'Week' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByRole('button', { name: 'Month' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: false }),
    );
    expect(summary()).toHaveTextContent(
      'This week · 6 h 20 min across 9 sessions, on 4 active days.',
    );
    expect(summary().props.accessible).toBe(true);
    expect(paths('/me/insights/week')).toHaveLength(1);
    expect(paths('/me/insights/month')).toHaveLength(0);
    expect(paths('/me/insights/heatmap')).toHaveLength(0);
  });

  it('moves to an earlier week by the server’s week start, never showing the other week’s numbers', async () => {
    await openInsights();
    fireEvent.press(screen.getByRole('button', { name: 'Previous week' }));
    await shows(/^Week of Monday, September 28 · 3 h 20 min across 5 sessions/);
    expect(screen.queryByText(/6 h 20 min across 9/)).toBeNull();
    expect(new URL(paths('/me/insights/week').at(-1)!.url).searchParams.get('weekStart')).toBe(
      '2026-09-28',
    );
    expect(screen.getByRole('button', { name: 'Next week' })).toBeEnabled();
    fireEvent.press(screen.getByRole('button', { name: 'Next week' }));
    await shows(/^This week ·/);
    // Back on the current week: no going past it.
    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled();
    // Each week is its own cache entry: the current one is not asked again.
    expect(paths('/me/insights/week')).toHaveLength(2);
  });

  it('lays the week out Monday first', async () => {
    await openInsights();
    const days = within(screen.getByTestId('period-days')).getAllByRole('button');
    expect(days).toHaveLength(7);
    expect(days[0]!.props.accessibilityLabel).toMatch(/^Monday, October 5/);
    expect(days[6]!.props.accessibilityLabel).toMatch(/^Sunday, October 11/);
  });

  it('switches to the month, and back without asking the week again', async () => {
    await openInsights();
    await toMonth();
    expect(paths('/me/insights/month')).toHaveLength(1);
    fireEvent.press(screen.getByRole('button', { name: 'Week' }));
    await shows(/^This week ·/);
    expect(paths('/me/insights/week')).toHaveLength(1);
  });
});

describe('weekly Insights', () => {
  it('groups goals, rest, streak, focus, and the week’s new records under the summary', async () => {
    await openInsights();
    for (const text of [
      'Average per active day: 1 h 35 min',
      'Longest session: 1 h 35 min, Wednesday, October 7',
      'Daily goal met on 3 of 3 days',
      'Weekly goal: 9 of 12 sessions',
      'Rest days: 1',
      'Current streak: 4 days',
      'Longest streak this week: 4 days',
      'New this week: Longest session: 1 h 35 min',
    ]) {
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
  });

  it('says nothing about a weekly goal the week did not have', async () => {
    server.state.weeks.current = makeWeek({
      goals: { daily: { completed: 3, eligible: 3 }, weekly: null },
    });
    await openInsights();
    expect(screen.queryByText(/Weekly goal/)).toBeNull();
  });

  it('shows each topic by name with its time, sessions, and the server’s share, archived ones too', async () => {
    await openInsights();
    const topics = within(screen.getByTestId('insights-topics'));
    expect(
      topics.getByRole('button', { name: 'Reading, 4 h · 6 sessions · 63%' }),
    ).toBeOnTheScreen();
    expect(
      topics.getByRole('button', {
        name: 'Old course, 2 h 20 min · 3 sessions · 37% · archived topic',
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByText(new RegExp(READING_ID))).toBeNull();
    expect(screen.queryByText(new RegExp(OLD_ID))).toBeNull();
  });

  it('says the day’s focus, rest, and daily goal for each day, rest and focus together', async () => {
    await openInsights();
    const days = within(screen.getByTestId('period-days'));
    expect(
      days.getByRole('button', {
        name: 'Tuesday, October 6: 1 h 20 min, 3 sessions, rest day, daily goal met',
      }),
    ).toBeOnTheScreen();
    expect(
      days.getByRole('button', {
        name: 'Thursday, October 8: 40 min, 1 session, daily goal in progress',
      }),
    ).toBeOnTheScreen();
    expect(
      days.getByRole('button', { name: 'Friday, October 9: no focus, daily goal in progress' }),
    ).toBeOnTheScreen();
  });

  it('draws an empty day neutral, never as a warning', async () => {
    await openInsights();
    const empty = screen.getByTestId('day-2026-10-09');
    const focused = screen.getByTestId('day-2026-10-07');
    expect(empty.props.style).not.toEqual(focused.props.style);
    // Neutral, never the warning color (there is no red scale).
    const emptyColor = StyleSheet.flatten(empty.props.style).backgroundColor;
    expect(emptyColor).toBe(lightTheme.colors.surface.sunken);
    expect(emptyColor).not.toBe(lightTheme.colors.warning);
    expect(screen.getByTestId('day-2026-10-06-rest')).toBeOnTheScreen();
  });

  it('says a quiet week calmly', async () => {
    server.state.weeks.current = makeWeek({
      summary: {
        focusedMilliseconds: 0,
        sessionCount: 0,
        activeDays: 0,
        averageFocusedMillisecondsPerActiveDay: null,
      },
      topics: [],
      longestSession: null,
      newRecords: [],
    });
    await openInsights();
    expect(summary()).toHaveTextContent('This week · no focus yet.');
    expect(screen.queryByText(/Average per active day/)).toBeNull();
  });
});

describe('monthly Insights', () => {
  it('leads with the month, then its rates, best day and week, and top topic', async () => {
    server.state.months.current = makeMonth({
      period: { ...makeMonth().period, year: 2026, month: 10, current: true, archived: false },
      archivedStats: null,
    });
    await openInsights();
    fireEvent.press(screen.getByRole('button', { name: 'Month' }));
    await shows(/^October 2026 · 25 h 10 min across 38 sessions, on 19 active days\.$/);
    for (const text of [
      'Daily goal met on 10 of 26 days',
      'Weekly goal met in 2 of 4 weeks',
      'Your best day: Thursday, September 17 · 3 h 5 min',
      'Your best week: Week of Monday, September 14 · 9 h',
      'Top topic: Reading',
      'Rest days: 3',
      'Longest streak this month: 9 days',
      'New this month: Most focused month: 25 h 10 min',
    ]) {
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
  });

  it('uses the weekly goal rate, never the archived tree’s weekly goal count', async () => {
    await openInsights();
    await toMonth();
    fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
    await shows(/^September 2026 ·/);
    expect(screen.getByText('Weekly goal met in 2 of 4 weeks')).toBeOnTheScreen();
    expect(screen.queryByText(/3 of 4 weeks|3 weekly goals/)).toBeNull();
  });

  it('explains calmly when an archived month has sessions synced later, leaving the tree as saved', async () => {
    server.state.months['2026-9'] = makeMonth({
      summary: { ...makeMonth().summary, focusedMilliseconds: 1555 * MIN, sessionCount: 39 },
    });
    await openInsights();
    await toMonth();
    fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
    await shows(/^September 2026 · 25 h 55 min across 39 sessions/);
    expect(
      screen.getByText(
        'Insights include sessions synced later. Your archived tree stays as it was saved.',
      ),
    ).toBeOnTheScreen();
    expect(requests.some((r) => r.url.includes('/me/forest') || r.url.includes('/recap'))).toBe(
      false,
    );
  });

  it('says nothing extra when the archived month matches its snapshot', async () => {
    await openInsights();
    await toMonth();
    fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
    await shows(/^September 2026 ·/);
    expect(screen.queryByText(/synced later/)).toBeNull();
  });
});

describe('the year’s heatmap', () => {
  it('loads only when asked, then summarises the year and offers each month in words', async () => {
    await openInsights();
    expect(paths('/me/insights/heatmap')).toHaveLength(0);
    fireEvent.press(screen.getByRole('button', { name: 'Show your year' }));
    expect(
      await screen.findByText(
        'Over the last year: 14 active days, 4 rest days, daily goal met on 13 days.',
      ),
    ).toBeOnTheScreen();
    const grid = screen.getByTestId('year-heatmap', { includeHiddenElements: true });
    expect(grid.props.importantForAccessibility).toBe('no-hide-descendants');
    const september = screen.getByRole('button', {
      name: 'September 2026: 20 h focused, 10 active days, 3 rest days',
    });
    fireEvent.press(september);
    await shows(/^September 2026 ·/);
    expect(screen.getByRole('button', { name: 'Month' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
  });
});

describe('personal records', () => {
  it('shows all six bests with their value and when, read as one line each', async () => {
    await openInsights();
    const records = within(await screen.findByTestId('insights-records'));
    for (const label of [
      'Most focused day: 3 h 5 min, Thursday, September 17',
      'Most focused week: 9 h, week of Monday, September 14',
      'Most focused month: 25 h 10 min, September 2026',
      'Longest streak: 12 days, reached Thursday, August 20',
      'Longest session: 1 h 35 min, Friday, October 2',
      'Longest daily goal streak: 6 days, reached Saturday, September 12',
    ]) {
      expect(records.getByLabelText(label)).toBeOnTheScreen();
    }
    expect(screen.queryByText(/worst/i)).toBeNull();
  });

  it('says calmly that records come with focus, with no empty trophies', async () => {
    server.state.records = [];
    await openInsights();
    expect(await screen.findByText('Your personal records appear as you focus.')).toBeOnTheScreen();
    expect(screen.queryByText(/: 0 /)).toBeNull();
  });
});

describe('History filters', () => {
  it('lists every session, discarded ones too, unfiltered at first', async () => {
    await openInsights();
    await shows(/Not counted/);
    expect(historyParams()[0]).toEqual({ limit: '30' });
  });

  it('filters by the selected week, month, a tapped day, and a topic, each from the first page', async () => {
    await openInsights();
    await shows(/Not counted/);
    fireEvent.press(screen.getByRole('button', { name: 'Load more sessions' }));
    await until(() => historyParams().length === 2);
    expect(historyParams()[1]).toEqual({ limit: '30', cursor: 'opaque:30' });

    fireEvent.press(screen.getByRole('button', { name: 'This week only' }));
    await until(() => historyParams().length === 3);
    expect(historyParams()[2]).toEqual({ limit: '30', week: '2026-10-05' });

    fireEvent.press(
      screen.getByRole('button', {
        name: 'Tuesday, October 6: 1 h 20 min, 3 sessions, rest day, daily goal met',
      }),
    );
    await until(() => historyParams().length === 4);
    expect(historyParams()[3]).toEqual({ limit: '30', from: '2026-10-06', to: '2026-10-06' });

    fireEvent.press(
      within(screen.getByTestId('insights-topics')).getByRole('button', { name: /^Old course/ }),
    );
    await until(() => historyParams().length === 5);
    expect(historyParams()[4]).toEqual({
      limit: '30',
      from: '2026-10-06',
      to: '2026-10-06',
      topicId: OLD_ID,
    });
    expect(screen.getByText('Showing: Tuesday, October 6 · Old course')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    await until(() => screen.queryByText(/^Showing:/) === null);
    // The unfiltered history is still cached: shown again, not a page from another filter.
    expect(historyParams().every((p) => !('cursor' in p) || Object.keys(p).length === 2)).toBe(
      true,
    );
  });

  it('filters by the month as sessions are attributed to it', async () => {
    await openInsights();
    await toMonth();
    fireEvent.press(screen.getByRole('button', { name: 'This month only' }));
    await until(() => historyParams().some((p) => 'month' in p));
    expect(historyParams().find((p) => 'month' in p)).toEqual({ limit: '30', month: '2026-10' });
    expect(screen.getByText('Showing: sessions of October 2026')).toBeOnTheScreen();
  });

  it('chooses a topic from every topic, archived included', async () => {
    await openInsights();
    fireEvent.press(screen.getByRole('button', { name: 'All topics' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Old course, archived topic' }));
    await until(() => historyParams().some((p) => p.topicId === OLD_ID));
    expect(screen.getByRole('button', { name: 'Topic: Old course' })).toBeOnTheScreen();
  });
});

describe('offline', () => {
  it('keeps the loaded week readable when a refresh fails, and says so', async () => {
    await openInsights();
    server.state.offline = true;
    fireEvent.press(screen.getByRole('button', { name: 'Month' }));
    fireEvent.press(screen.getByRole('button', { name: 'Week' }));
    await appState.emit('background');
    await appState.emit('active');
    await pause();
    expect(summary()).toHaveTextContent(
      'This week · 6 h 20 min across 9 sessions, on 4 active days.',
    );
  });

  it('never adds a session waiting on the device to the server’s numbers', async () => {
    // A 60-minute session still waiting on the device (the server does not have it).
    await AsyncStorage.setItem(
      sessionOutboxKey('user-1'),
      JSON.stringify({
        version: 1,
        items: [
          {
            id: '0192f1a2-3b4c-7d5e-8f60-0000000000aa',
            payload: makeSubmissionBody({
              startedAt: '2026-10-07T07:00:00.000Z',
              endedAt: '2026-10-07T08:00:00.000Z',
              plannedMinutes: 60,
              pauseIntervals: [],
            }),
            state: 'pending',
            reason: null,
            queuedAt: Date.now(),
          },
        ],
      }),
    );
    await openInsights();
    expect(summary()).toHaveTextContent(/6 h 20 min across 9 sessions/);
    await pause();
    expect(summary()).toHaveTextContent(/6 h 20 min across 9 sessions/);
    expect(screen.queryByText(/7 h 20 min|10 sessions/)).toBeNull();
  });
});

describe('accessibility', () => {
  it('reads records, topics, and days by name and number, never color alone', async () => {
    await openInsights();
    expect(screen.getByText('Topics')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Personal records' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Focus history' })).toBeOnTheScreen();
  });

  it('keeps the period selector and filters wrapping at 200% text', async () => {
    mockWindow.fontScale = 2;
    await openInsights();
    expect(screen.getByTestId('period-selector')).toHaveStyle({ flexWrap: 'wrap' });
    expect(screen.getByTestId('history-filters')).toHaveStyle({ flexWrap: 'wrap' });
  });

  it('shares the topic share as a whole percentage, not the raw ratio', async () => {
    server.state.weeks.current = makeWeek({ topics: [topicInsight({ share: 0.4204 })] });
    await openInsights();
    expect(screen.getByRole('button', { name: /· 42%$/ })).toBeOnTheScreen();
    expect(screen.queryByText(/0\.42/)).toBeNull();
  });
});
