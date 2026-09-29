import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ApiProvider, createApi, createQueryClient } from '../../api';
import { fakeFetch, makeSession, memoryTokenStore, NOW } from '../../test-utils/api';
import { mockAppState } from '../../test-utils/app-state';
import { activeTimerKey, ActiveTimerStore, type KeyValueStorage } from '../active-timer-store';
import { ActiveTimerProvider, useActiveTimer } from '../ActiveTimerProvider';

const TOPIC = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';
const ADA = '11111111-1111-4111-8111-111111111111';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

function Probe() {
  const { status, userId, timer } = useActiveTimer();
  return <Text testID="timer">{`${status}|${userId ?? '-'}|${timer?.plannedMinutes ?? '-'}`}</Text>;
}

function setup(storage = memoryStorage(), clock = { now: NOW }) {
  const api = createApi({
    baseUrl: 'https://api.test',
    fetch: fakeFetch(() => ({ status: 500 })).fetch,
    store: memoryTokenStore(makeSession({ user: { id: ADA, email: 'ada@example.com' } })),
    now: () => NOW,
  });
  const timers = new ActiveTimerStore({
    storage,
    now: () => clock.now,
    createId: () => '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
    report: () => undefined,
  });
  render(
    <ApiProvider api={api} queryClient={createQueryClient()}>
      <ActiveTimerProvider store={timers}>
        <Probe />
      </ActiveTimerProvider>
    </ApiProvider>,
  );
  return { api, timers, storage };
}

describe('ActiveTimerProvider', () => {
  it("restores the signed-in user's timer at launch", async () => {
    const storage = memoryStorage();
    const earlier = new ActiveTimerStore({
      storage,
      now: () => NOW,
      createId: () => '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
      report: () => undefined,
    });
    await earlier.activate(ADA);
    await earlier.start({
      topicId: TOPIC,
      plannedMinutes: 45,
      rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
    });

    const { api } = setup(storage);
    expect(screen.getByTestId('timer')).toHaveTextContent('inactive|-|-');
    await act(() => api.session.restore());

    await waitFor(() => expect(screen.getByTestId('timer')).toHaveTextContent(`ready|${ADA}|45`));
  });

  it('forgets the timer in memory on sign-out, and keeps it in storage', async () => {
    const { api, timers, storage } = setup();
    await act(() => api.session.restore());
    await waitFor(() => expect(screen.getByTestId('timer')).toHaveTextContent(`ready|${ADA}|-`));
    await act(async () => {
      await timers.start({
        topicId: TOPIC,
        plannedMinutes: 25,
        rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
      });
    });

    await act(() => api.session.clear());

    await waitFor(() => expect(screen.getByTestId('timer')).toHaveTextContent('inactive|-|-'));
    expect(storage.data.has(activeTimerKey(ADA))).toBe(true);
  });
});

describe('ActiveTimerProvider and the app lifecycle', () => {
  const MINUTE = 60_000;
  const RULES = { minValidMinutes: 5, maxPauseMinutes: 30 };

  async function runningTimer(clock: { now: number }) {
    const appState = mockAppState();
    const { api, timers, storage } = setup(memoryStorage(), clock);
    await act(() => api.session.restore());
    await waitFor(() => expect(timers.getSnapshot().status).toBe('ready'));
    await act(async () => {
      await timers.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });
    });
    return { appState, timers, storage };
  }

  const stored = (storage: { data: Map<string, string> }) =>
    JSON.parse(storage.data.get(activeTimerKey(ADA)) ?? 'null');

  it('stores a completion that happened in the background at its instant, not at the return', async () => {
    const clock = { now: NOW };
    const { appState, timers, storage } = await runningTimer(clock);

    await appState.emit('background');
    clock.now = NOW + 40 * MINUTE;
    await appState.emit('active');

    await waitFor(() =>
      expect(timers.getSnapshot().timer?.finished).toEqual({
        at: NOW + 25 * MINUTE,
        reason: 'completed',
      }),
    );
    expect(stored(storage).finished).toEqual({ at: NOW + 25 * MINUTE, reason: 'completed' });
  });

  it('stores a pause that ran past the limit in the background as ending at the limit', async () => {
    const clock = { now: NOW };
    const { appState, timers, storage } = await runningTimer(clock);
    clock.now = NOW + 5 * MINUTE;
    await act(async () => {
      await timers.pause();
    });

    await appState.emit('background');
    clock.now = NOW + 60 * MINUTE;
    await appState.emit('active');

    await waitFor(() =>
      expect(stored(storage).finished).toEqual({
        at: NOW + 35 * MINUTE,
        reason: 'pause_limit',
      }),
    );
  });

  it('leaves a timer that is still running as it is stored', async () => {
    const clock = { now: NOW };
    const { appState, timers, storage } = await runningTimer(clock);
    const before = storage.data.get(activeTimerKey(ADA));

    await appState.emit('background');
    clock.now = NOW + 10 * MINUTE;
    await appState.emit('active');
    await act(async () => {
      await timers.refresh();
    });

    expect(storage.data.get(activeTimerKey(ADA))).toBe(before);
    expect(timers.getSnapshot().timer?.finished).toBeNull();
  });

  it('only listens while mounted', async () => {
    const clock = { now: NOW };
    const { appState } = await runningTimer(clock);
    expect(appState.listeners()).toBe(1);
    screen.unmount();
    expect(appState.listeners()).toBe(0);
  });
});
