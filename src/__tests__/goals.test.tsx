import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, within } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';

import { NetworkError, type Goals, type RestDays, type Streak } from '../api';
import { homeSnapshotKey } from '../core-loop/home-snapshot-store';
import { fakeFetch, nestError, type FakeRequest } from '../test-utils/api';
import { mockAppState } from '../test-utils/app-state';
import {
  defaultGoals,
  makeGoals,
  makeRestDays,
  makeStreak,
  streakWithOffer,
} from '../test-utils/consistency';
import { HOME_TODAY, makeCurrentTree, makeHome } from '../test-utils/core-loop';
import { makePreferences } from '../test-utils/preferences';
import { renderApp } from '../test-utils/render-app';
import { appRoutes } from '../test-utils/routes';
import { signInForTest } from '../test-utils/secure-store-mock';
import { settleSheetTransitions, until } from '../test-utils/sheets';

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
const NEXT_MONDAY = '2026-10-12';

type Reply = { status: number; body?: unknown } | Error;
const refusal = (status: number, code: string): Reply => ({
  status,
  body: { statusCode: status, message: 'Server words the user never sees.', code },
});

/**
 * The A3.2 API as these tests script it. The server's rules are not reproduced here: each write
 * answers what the test says the server decided (`dailyAnswer`, `weeklyAnswer`, …), or the
 * plain outcome a server would give for the fixture. Home is built from the same state, so a
 * write shows on Home once Home is asked again.
 */
function consistencyApi() {
  const state = {
    offline: false,
    goals: makeGoals() as Goals,
    rest: makeRestDays() as RestDays,
    streak: makeStreak() as Streak,
    /** The next answer to a goal write (else the plain outcome below). */
    dailyAnswer: null as Reply | null,
    weeklyAnswer: null as Reply | null,
    restAnswer: null as Reply | null,
    recoveryAnswer: null as Reply | null,
    /** The streak the server has once the recovery is stored. */
    streakAfterRecovery: null as Streak | null,
  };
  const home = () =>
    makeHome({
      goals: state.goals,
      streak: state.streak,
      rest: {
        today: state.rest.restDays.some((day) => day.date === HOME_TODAY),
        allowance: state.rest.allowance,
      },
    });
  const once = (key: 'dailyAnswer' | 'weeklyAnswer' | 'restAnswer' | 'recoveryAnswer') => {
    const answer = state[key];
    state[key] = null;
    return answer;
  };
  const handler = ({ url, method, body }: FakeRequest): Reply => {
    const { pathname } = new URL(url);
    if (pathname === '/me/preferences') return { status: 200, body: makePreferences() };
    if (state.offline) return new NetworkError();
    if (pathname === '/session-rules')
      return { status: 200, body: { version: 1, minValidMinutes: 5, maxPauseMinutes: 30 } };
    if (pathname === '/me/topics') return { status: 200, body: [] };
    if (pathname === '/me/home') return { status: 200, body: home() };
    if (pathname === '/me/trees/current') return { status: 200, body: makeCurrentTree() };
    if (pathname === '/me/goals') return { status: 200, body: state.goals };
    if (pathname === '/me/goals/daily' && method === 'PUT') {
      const answer = once('dailyAnswer');
      if (answer) {
        if (!(answer instanceof Error) && answer.status < 300) state.goals = answer.body as Goals;
        return answer;
      }
      const { minutes } = body as { minutes: number };
      state.goals = state.goals.daily.isDefault
        ? makeGoals({ minutes, isDefault: false, pending: null })
        : makeGoals({ ...state.goals.daily, pending: { minutes, effectiveFrom: '2026-10-08' } });
      return { status: 200, body: state.goals };
    }
    if (pathname === '/me/goals/weekly') {
      const answer = once('weeklyAnswer');
      if (answer) {
        if (!(answer instanceof Error) && answer.status < 300) state.goals = answer.body as Goals;
        return answer;
      }
      return { status: 500, body: nestError(500, 'Not scripted.') };
    }
    if (pathname === '/me/rest-days' && method === 'GET') return { status: 200, body: state.rest };
    if (pathname.startsWith('/me/rest-days/')) {
      const answer = once('restAnswer');
      if (answer) return answer;
      const date = pathname.split('/').at(-1)!;
      const dates = state.rest.restDays.map((day) => day.date).filter((d) => d !== date);
      state.rest = makeRestDays(method === 'PUT' ? [...dates, date].sort() : dates);
      return { status: method === 'PUT' ? 201 : 200, body: state.rest };
    }
    if (pathname === '/me/streak' && method === 'GET') return { status: 200, body: state.streak };
    if (pathname === '/me/streak/recoveries' && method === 'POST') {
      const answer = once('recoveryAnswer');
      if (answer) return answer;
      state.streak = state.streakAfterRecovery ?? state.streak;
      return { status: 201, body: state.streak };
    }
    return { status: 500, body: nestError(500, 'Not in this test.') };
  };
  return { handler, state };
}

let server: ReturnType<typeof consistencyApi>;
let requests: FakeRequest[];
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_API_URL = API;
  mockWindow.fontScale = 1;
  await AsyncStorage.clear();
  signInForTest();
  server = consistencyApi();
  const net = fakeFetch(server.handler);
  requests = net.requests;
  globalThis.fetch = net.fetch;
  mockAppState();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockClear();
});
afterEach(async () => {
  await settleSheetTransitions();
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

const shows = (text: string | RegExp) => until(() => screen.queryByText(text) !== null);
const writes = () => requests.filter((r) => r.method !== 'GET');
const writesTo = (path: string) => writes().filter((r) => new URL(r.url).pathname === path);
const homeRequests = () => requests.filter((r) => r.url === `${API}/me/home`);
const pause = (ms = 200) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const section = (name: string) => within(screen.getByTestId(`goals-${name}`));

async function openGoals() {
  renderApp(appRoutes, { initialUrl: '/profile/goals' });
  await screen.findByRole('header', { name: 'Daily goal' });
  await shows(/ a day$/);
}

describe('Goals entry', () => {
  it('opens Goals and rest days from Profile', async () => {
    renderApp(appRoutes, { initialUrl: '/profile' });
    fireEvent.press(await screen.findByRole('button', { name: 'Goals and rest days' }));
    expect(await screen.findByRole('header', { name: 'Daily goal' })).toBeOnTheScreen();
  });
});

describe('daily goal', () => {
  it('leads with the daily goal value and today’s progress, from the server', async () => {
    await openGoals();
    const daily = section('daily');
    expect(daily.getByText('1 h a day')).toBeOnTheScreen();
    expect(daily.getByRole('progressbar', { name: 'Today' })).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ text: '42 / 60 min' }),
    );
    expect(screen.getByText(/goals opens blossoms on this month’s tree/)).toBeOnTheScreen();
  });

  it('shows a never-chosen default as a suggestion, and saves nothing by itself', async () => {
    server.state.goals = defaultGoals();
    await openGoals();
    expect(section('daily').getByText('30 min a day')).toBeOnTheScreen();
    expect(screen.getByText('Suggested to start. Save it to make it your goal.')).toBeOnTheScreen();
    await pause();
    expect(writes()).toEqual([]);
  });

  it('saves a first goal, which the server applies today', async () => {
    server.state.goals = defaultGoals();
    await openGoals();
    fireEvent.press(screen.getByRole('button', { name: 'Save daily goal' }));
    await shows('Saved. Your daily goal is 30 min, starting today.');
    expect(writesTo('/me/goals/daily').map((r) => r.body)).toEqual([{ minutes: 30 }]);
    expect(screen.queryByText(/Suggested to start/)).toBeNull();
  });

  it('keeps the current goal in effect and shows a change that starts tomorrow', async () => {
    await openGoals();
    fireEvent.press(screen.getByRole('button', { name: '45 minutes a day' }));
    fireEvent.press(screen.getByRole('button', { name: 'Save daily goal' }));
    await shows('Saved. Your goal changes to 45 min tomorrow.');
    expect(writesTo('/me/goals/daily').map((r) => r.body)).toEqual([{ minutes: 45 }]);
    // The goal in effect today is still the server's current one.
    expect(section('daily').getByText('1 h a day')).toBeOnTheScreen();
    expect(section('daily').getByText('Changes to 45 min tomorrow.')).toBeOnTheScreen();
    expect(section('daily').getByRole('progressbar', { name: 'Today' })).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ text: '42 / 60 min' }),
    );
  });

  it('opens with the pending value selected, and saving it again stays calm', async () => {
    server.state.goals = makeGoals({ pending: { minutes: 45, effectiveFrom: '2026-10-08' } });
    await openGoals();
    expect(screen.getByRole('button', { name: '45 minutes a day' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Save daily goal' }));
    await shows('Saved. Your goal changes to 45 min tomorrow.');
    expect(screen.queryByText(/couldn't|can't/)).toBeNull();
  });

  it('takes custom minutes, with their unit, and checks only the API’s range first', async () => {
    await openGoals();
    fireEvent.press(screen.getByRole('button', { name: 'Custom daily goal' }));
    const input = screen.getByLabelText('Minutes per day');
    fireEvent.changeText(input, '0');
    fireEvent.press(screen.getByRole('button', { name: 'Save daily goal' }));
    expect(await screen.findByText('Enter whole minutes from 1 to 1440.')).toBeOnTheScreen();
    expect(writes()).toEqual([]);

    fireEvent.changeText(input, '75');
    fireEvent.press(screen.getByRole('button', { name: 'Save daily goal' }));
    await shows(/Saved\. Your goal changes to 1 h 15 min tomorrow\./);
    expect(writesTo('/me/goals/daily').map((r) => r.body)).toEqual([{ minutes: 75 }]);
  });

  it('says calmly when the server does not take the value, without its words or code', async () => {
    await openGoals();
    server.state.dailyAnswer = {
      status: 400,
      body: nestError(400, ['minutes must be at most 1440.']),
    };
    fireEvent.press(screen.getByRole('button', { name: 'Save daily goal' }));
    await shows("That goal can't be saved. Choose from 1 to 1440 minutes.");
    expect(screen.queryByText(/must be|1440\.$|invalid_value/)).toBeNull();
    expect(section('daily').getByText('1 h a day')).toBeOnTheScreen();
  });
});

describe('weekly goal', () => {
  const sessions5: Goals['weekly'] = {
    goal: { type: 'session_count', target: 5 },
    pending: null,
    thisWeek: {
      weekStart: '2026-10-05',
      type: 'session_count',
      target: 5,
      current: 2,
      completed: false,
    },
  };
  const withWeekly = (weekly: Goals['weekly']): Goals => ({ ...makeGoals(), weekly });

  it('treats no weekly goal as an optional setup, never a target of zero', async () => {
    await openGoals();
    const weekly = section('weekly');
    expect(
      weekly.getByText("A weekly goal is optional. This week's focus still shows on Home."),
    ).toBeOnTheScreen();
    expect(weekly.queryByRole('progressbar')).toBeNull();
    expect(weekly.queryByText(/\b0 /)).toBeNull();
  });

  it('creates a first weekly goal of focus time, in hours, applied this week', async () => {
    await openGoals();
    fireEvent.press(screen.getByRole('button', { name: 'Set a weekly goal' }));
    expect(screen.getByRole('button', { name: 'Weekly goal by focus time' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    fireEvent.press(screen.getByRole('button', { name: '5 hours a week' }));
    server.state.weeklyAnswer = {
      status: 200,
      body: withWeekly({
        goal: { type: 'focused_minutes', target: 300 },
        pending: null,
        thisWeek: {
          weekStart: '2026-10-05',
          type: 'focused_minutes',
          target: 300,
          current: 200,
          completed: false,
        },
      }),
    };
    fireEvent.press(screen.getByRole('button', { name: 'Save weekly goal' }));
    await shows('Saved. Your weekly goal starts this week.');
    expect(writesTo('/me/goals/weekly').map((r) => [r.method, r.body])).toEqual([
      ['PUT', { type: 'focused_minutes', target: 300 }],
    ]);
    const weekly = section('weekly');
    expect(weekly.getByText('5 h a week')).toBeOnTheScreen();
    expect(weekly.getByRole('progressbar', { name: 'This week' })).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ text: '200 / 300 min' }),
    );
  });

  it('shows a session goal as a count, and a change from next Monday beside the current one', async () => {
    server.state.goals = withWeekly(sessions5);
    await openGoals();
    expect(section('weekly').getByText('5 sessions a week')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Change weekly goal' }));
    expect(screen.getByRole('button', { name: 'Weekly goal by sessions' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    fireEvent.press(screen.getByRole('button', { name: '10 sessions a week' }));
    server.state.weeklyAnswer = {
      status: 200,
      body: withWeekly({
        ...sessions5,
        pending: { goal: { type: 'session_count', target: 10 }, effectiveFrom: NEXT_MONDAY },
      }),
    };
    fireEvent.press(screen.getByRole('button', { name: 'Save weekly goal' }));
    await shows('Saved. Your new weekly goal starts Monday, October 12.');
    const weekly = section('weekly');
    expect(weekly.getByText('5 sessions a week')).toBeOnTheScreen();
    expect(weekly.getByText('From Monday, October 12: 10 sessions a week.')).toBeOnTheScreen();
    expect(weekly.getByRole('progressbar', { name: 'This week' })).toHaveProp(
      'accessibilityValue',
      expect.objectContaining({ text: '2 / 5 sessions' }),
    );
  });

  it('ends the weekly goal from next Monday after asking, and keeps this week’s', async () => {
    server.state.goals = withWeekly(sessions5);
    await openGoals();
    fireEvent.press(screen.getByRole('button', { name: 'End weekly goal' }));
    expect(await screen.findByText('End your weekly goal?')).toBeOnTheScreen();
    expect(writes()).toEqual([]);
    server.state.weeklyAnswer = {
      status: 200,
      body: withWeekly({ ...sessions5, pending: { goal: null, effectiveFrom: NEXT_MONDAY } }),
    };
    const confirm = screen.getAllByRole('button', { name: 'End weekly goal' });
    fireEvent.press(confirm[confirm.length - 1]!);
    await shows('Saved. Your weekly goal ends on Monday, October 12.');
    expect(writesTo('/me/goals/weekly').map((r) => r.method)).toEqual(['DELETE']);
    expect(
      section('weekly').getByText('Your weekly goal ends on Monday, October 12.'),
    ).toBeOnTheScreen();
    expect(section('weekly').getByText('5 sessions a week')).toBeOnTheScreen();
  });
});

describe('rest days', () => {
  it('shows the server’s weekly allowance, not one counted on the device', async () => {
    // The server says one is used, though no planned day is listed in this week.
    server.state.rest = makeRestDays([], { used: 1, remaining: 1 });
    await openGoals();
    expect(await screen.findByText('1 of 2 rest days left this week')).toBeOnTheScreen();
  });

  it('explains that rest keeps the streak, and that focusing on a rest day still counts', async () => {
    await openGoals();
    expect(
      await screen.findByText(
        "A rest day keeps your streak and your tree's vitality. If you focus on a rest day, it still counts, and the day stays a rest day.",
      ),
    ).toBeOnTheScreen();
  });

  it('labels each day with its date and state, and offers no past day', async () => {
    server.state.rest = makeRestDays(['2026-10-09']);
    await openGoals();
    const monday = await screen.findByLabelText('Monday, October 5, past');
    expect(monday).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
    expect(screen.getByLabelText('Wednesday, October 7, today, not planned')).toBeOnTheScreen();
    expect(screen.getByLabelText('Friday, October 9, rest day planned')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: true }),
    );
    fireEvent.press(monday);
    await pause();
    expect(writes()).toEqual([]);
  });

  it('plans today as a rest day, and Home shows it at once', async () => {
    await openGoals();
    const before = homeRequests().length;
    fireEvent.press(await screen.findByLabelText('Wednesday, October 7, today, not planned'));
    expect(
      await screen.findByLabelText('Wednesday, October 7, today, rest day planned'),
    ).toBeOnTheScreen();
    expect(writes().map((r) => [r.method, new URL(r.url).pathname])).toEqual([
      ['PUT', '/me/rest-days/2026-10-07'],
    ]);
    expect(await screen.findByText('1 of 2 rest days left this week')).toBeOnTheScreen();
    await until(() => homeRequests().length > before);
  });

  it('plans a later day and cancels a planned one', async () => {
    server.state.rest = makeRestDays(['2026-10-09']);
    await openGoals();
    fireEvent.press(await screen.findByLabelText('Tuesday, October 13, not planned'));
    await screen.findByLabelText('Tuesday, October 13, rest day planned');
    fireEvent.press(screen.getByLabelText('Friday, October 9, rest day planned'));
    await screen.findByLabelText('Friday, October 9, not planned');
    expect(writes().map((r) => [r.method, new URL(r.url).pathname])).toEqual([
      ['PUT', '/me/rest-days/2026-10-13'],
      ['DELETE', '/me/rest-days/2026-10-09'],
    ]);
  });

  it.each([
    [
      refusal(409, 'rest_allowance_used'),
      "This week's rest days are already planned. Remove one to choose another day.",
    ],
    [refusal(422, 'rest_day_today_not_allowed'), "Today can't become a rest day anymore."],
    [refusal(422, 'rest_day_in_past'), "That day has passed, so it can't be a rest day."],
    [refusal(422, 'rest_day_too_far_ahead'), 'Rest days can be planned up to a year ahead.'],
  ])('says calmly why the server did not plan it (%#)', async (answer, message) => {
    await openGoals();
    server.state.restAnswer = answer;
    fireEvent.press(await screen.findByLabelText('Thursday, October 8, not planned'));
    await shows(message);
    expect(screen.queryByText(/rest_|Server words/)).toBeNull();
    expect(screen.getByLabelText('Thursday, October 8, not planned')).toBeOnTheScreen();
  });

  it('shows the allowance used up as a plain state, not a failure', async () => {
    server.state.rest = makeRestDays(['2026-10-08', '2026-10-09']);
    await openGoals();
    expect(await screen.findByText("This week's rest days are all planned.")).toBeOnTheScreen();
  });
});

describe('streak', () => {
  it('shows the server’s current and longest streak, today, and the next milestone', async () => {
    await openGoals();
    const streak = section('streak');
    expect(streak.getByText('Current streak: 4 days')).toBeOnTheScreen();
    expect(streak.getByText('Longest streak: 9 days')).toBeOnTheScreen();
    expect(streak.getByText('Today counts toward your streak.')).toBeOnTheScreen();
    expect(streak.getByText('Next milestone: 7 days.')).toBeOnTheScreen();
    expect(
      streak.getByText('One focus session a day keeps a streak. The daily goal is separate.'),
    ).toBeOnTheScreen();
  });

  it('says a rest day keeps the streak, from the server’s today', async () => {
    server.state.streak = makeStreak({ today: 'rest' });
    await openGoals();
    expect(section('streak').getByText('Rest day today. Your streak is kept.')).toBeOnTheScreen();
  });

  it('never reconstructs the streak from anything but the streak answer', async () => {
    server.state.streak = makeStreak({
      current: 17,
      longest: 17,
      milestones: { reached: [3, 7, 14], next: 30 },
    });
    await openGoals();
    await until(() => screen.queryByText('Current streak: 17 days') !== null);
    expect(screen.getByText('Milestones reached: 3, 7, and 14 days.')).toBeOnTheScreen();
    expect(requests.some((r) => r.url.includes('/me/sessions'))).toBe(false);
  });
});

describe('streak recovery', () => {
  it('offers nothing when the server offers nothing', async () => {
    await openGoals();
    await pause();
    expect(screen.queryByRole('button', { name: 'Keep my streak' })).toBeNull();
    expect(screen.queryByText(/Want to keep/)).toBeNull();
  });

  it('offers to keep the streak and asks first: nothing is sent before confirming', async () => {
    server.state.streak = streakWithOffer(12);
    await openGoals();
    expect(await screen.findByText('Want to keep your 12-day streak?')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Keep my streak' }));
    expect(await screen.findByText('Keep your 12-day streak?')).toBeOnTheScreen();
    expect(
      screen.getByText(
        /Tuesday, October 6 will bridge your streak\. It adds no focus time or growth\./,
      ),
    ).toBeOnTheScreen();
    expect(writes()).toEqual([]);
    fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    await pause();
    expect(writes()).toEqual([]);
  });

  it('keeps it once confirmed, then refreshes the streak, Home, and the tree', async () => {
    server.state.streak = streakWithOffer(12);
    server.state.streakAfterRecovery = makeStreak({
      current: 13,
      longest: 13,
      milestones: { reached: [3, 7], next: 14 },
    });
    await openGoals();
    const before = homeRequests().length;
    fireEvent.press(await screen.findByRole('button', { name: 'Keep my streak' }));
    const confirm = await screen.findAllByRole('button', { name: 'Keep my streak' });
    fireEvent.press(confirm[confirm.length - 1]!);
    await shows('Your streak is kept.');
    expect(writesTo('/me/streak/recoveries').map((r) => r.body)).toEqual([
      { missedDate: '2026-10-06' },
    ]);
    expect(section('streak').getByText('Current streak: 13 days')).toBeOnTheScreen();
    expect(screen.queryByText('Want to keep your 12-day streak?')).toBeNull();
    await until(() => homeRequests().length > before);
    expect(
      jest.mocked(AccessibilityInfo.announceForAccessibility).mock.calls.map(([m]) => m),
    ).toContain('Your streak is kept.');
  });

  it('treats a repeated acceptance (200) as kept', async () => {
    server.state.streak = streakWithOffer(12);
    server.state.recoveryAnswer = { status: 200, body: makeStreak({ current: 13, longest: 13 }) };
    await openGoals();
    fireEvent.press(await screen.findByRole('button', { name: 'Keep my streak' }));
    const confirm = await screen.findAllByRole('button', { name: 'Keep my streak' });
    fireEvent.press(confirm[confirm.length - 1]!);
    await shows('Your streak is kept.');
  });

  it('says calmly when the offer has expired, asks once, and shows the server’s streak again', async () => {
    server.state.streak = streakWithOffer(12);
    server.state.recoveryAnswer = refusal(422, 'return_window_passed');
    await openGoals();
    fireEvent.press(await screen.findByRole('button', { name: 'Keep my streak' }));
    // Meanwhile the server stopped offering it.
    server.state.streak = makeStreak({
      current: 1,
      longest: 12,
      milestones: { reached: [], next: 3 },
    });
    const confirm = await screen.findAllByRole('button', { name: 'Keep my streak' });
    fireEvent.press(confirm[confirm.length - 1]!);
    await shows('Recovery is no longer available.');
    await until(() => screen.queryByText('Want to keep your 12-day streak?') === null);
    expect(section('streak').getByText('Current streak: 1 day')).toBeOnTheScreen();
    expect(screen.queryByText('Your streak is kept.')).toBeNull();
    await pause();
    expect(writesTo('/me/streak/recoveries')).toHaveLength(1);
  });
});

describe('offline', () => {
  async function savedHomeThenOffline() {
    renderApp(appRoutes, { initialUrl: '/' });
    await screen.findByRole('image');
    await until(() => true);
    for (
      let i = 0;
      i < 100 && (await AsyncStorage.getItem(homeSnapshotKey(USER))) === null;
      i += 1
    ) {
      await pause(50);
    }
    screen.unmount();
    server.state.offline = true;
  }

  it('shows the last known goals and streak, and says so', async () => {
    await savedHomeThenOffline();
    await openGoals();
    expect(section('daily').getByText('1 h a day')).toBeOnTheScreen();
    expect(screen.getByText('Showing your goals as last saved on this device.')).toBeOnTheScreen();
    expect(section('streak').getByText('Current streak: 4 days')).toBeOnTheScreen();
    expect(screen.getByText("Planned rest days show when you're online.")).toBeOnTheScreen();
  });

  it('never pretends a change was saved while offline', async () => {
    await savedHomeThenOffline();
    await openGoals();
    fireEvent.press(screen.getByRole('button', { name: '45 minutes a day' }));
    fireEvent.press(screen.getByRole('button', { name: 'Save daily goal' }));
    await shows("You're offline, so nothing was changed. Connect and try again.");
    expect(screen.queryByText(/^Saved/)).toBeNull();
    expect(section('daily').getByText('1 h a day')).toBeOnTheScreen();
    expect(section('daily').queryByText(/Changes to/)).toBeNull();
  });
});

describe('accessibility', () => {
  it('names each preset with its unit and selected state, never by color alone', async () => {
    await openGoals();
    const sixty = screen.getByRole('button', { name: '1 hour a day' });
    expect(sixty).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
    expect(screen.getByRole('button', { name: '30 minutes a day' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ selected: false }),
    );
  });

  it('lists the rest days one per row at large text, so nothing is clipped', async () => {
    mockWindow.fontScale = 2;
    await openGoals();
    const planner = await screen.findByTestId('rest-planner');
    expect(planner).toHaveStyle({ flexDirection: 'column' });
  });
});
