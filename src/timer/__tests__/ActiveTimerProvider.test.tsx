import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ApiProvider, createApi, createQueryClient } from '../../api';
import { fakeFetch, makeSession, memoryTokenStore, NOW } from '../../test-utils/api';
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

function setup(storage = memoryStorage()) {
  const api = createApi({
    baseUrl: 'https://api.test',
    fetch: fakeFetch(() => ({ status: 500 })).fetch,
    store: memoryTokenStore(makeSession({ user: { id: ADA, email: 'ada@example.com' } })),
    now: () => NOW,
  });
  const timers = new ActiveTimerStore({
    storage,
    now: () => NOW,
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
