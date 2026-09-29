import { act, render, waitFor } from '@testing-library/react-native';

import { ApiProvider, createApi, createQueryClient } from '../../api';
import { fakeFetch, makeSession, memoryTokenStore, NOW } from '../../test-utils/api';
import { mockAppState } from '../../test-utils/app-state';
import { makePreferences } from '../../test-utils/preferences';
import { memoryStorage } from '../../test-utils/storage';
import { ActiveTimerStore } from '../../timer/active-timer-store';
import { ActiveTimerProvider } from '../../timer/ActiveTimerProvider';
import {
  TimerNotificationCoordinator,
  type TimerNotification,
  type TimerNotificationAdapter,
} from '../timer-notifications';
import { TimerNotificationSync } from '../TimerNotificationSync';

const ADA = { id: '11111111-1111-4111-8111-111111111111', email: 'ada@example.com' };
const TOPIC = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';
const MINUTE = 60_000;

function setup({ sound = true } = {}) {
  const appState = mockAppState();
  const pending = new Map<string, TimerNotification>();
  const adapter: TimerNotificationAdapter = {
    permission: async () => ({ status: 'granted', canAskAgain: true }),
    requestPermission: async () => ({ status: 'granted', canAskAgain: true }),
    scheduled: async () => [...pending.values()],
    schedule: async (n) => void pending.set(n.identifier, n),
    cancel: async (identifier) => void pending.delete(identifier),
  };
  const clock = { now: NOW };
  const timers = new ActiveTimerStore({
    storage: memoryStorage(),
    now: () => clock.now,
    createId: () => '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
    report: () => undefined,
  });
  const coordinator = new TimerNotificationCoordinator({
    timers,
    adapter,
    report: () => undefined,
  });
  const api = createApi({
    baseUrl: 'https://api.example.com',
    fetch: fakeFetch(({ url }) =>
      url.endsWith('/me/preferences')
        ? { status: 200, body: makePreferences({ sound }) }
        : { status: 500 },
    ).fetch,
    store: memoryTokenStore(makeSession({ user: ADA })),
    now: () => NOW,
  });
  const view = render(
    <ApiProvider api={api} queryClient={createQueryClient()}>
      <ActiveTimerProvider store={timers} onForeground={() => void coordinator.reconcile()}>
        <TimerNotificationSync coordinator={coordinator} />
      </ActiveTimerProvider>
    </ApiProvider>,
  );
  return { api, appState, clock, coordinator, pending, timers, view };
}

describe('TimerNotificationSync', () => {
  it('keeps the OS in step with the stored timer, with the sound preference', async () => {
    const app = setup({ sound: false });
    await act(() => app.api.session.restore());
    await waitFor(() => expect(app.timers.getSnapshot().status).toBe('ready'));
    await act(async () => {
      await app.timers.start({
        topicId: TOPIC,
        plannedMinutes: 25,
        rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
      });
    });

    await waitFor(() =>
      expect([...app.pending.values()]).toEqual([
        expect.objectContaining({ event: 'completion', at: NOW + 25 * MINUTE, sound: false }),
      ]),
    );
  });

  it('reconciles after the foreground refresh has stored an end reached in the background', async () => {
    const app = setup();
    await act(() => app.api.session.restore());
    await waitFor(() => expect(app.timers.getSnapshot().status).toBe('ready'));
    await act(async () => {
      await app.timers.start({
        topicId: TOPIC,
        plannedMinutes: 25,
        rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
      });
    });
    await waitFor(() => expect(app.pending.size).toBe(1));

    // The OS lost it meanwhile (or scheduling had failed): the return repairs it.
    app.pending.clear();
    await app.appState.emit('active');
    await waitFor(() => expect(app.pending.size).toBe(1));

    await app.appState.emit('background');
    app.clock.now = NOW + 30 * MINUTE;
    await app.appState.emit('active');
    await waitFor(() => expect(app.timers.getSnapshot().timer?.finished).not.toBeNull());
    await waitFor(() => expect(app.pending.size).toBe(0));
  });

  it('stops following the timer once unmounted', async () => {
    const app = setup();
    await act(() => app.api.session.restore());
    await waitFor(() => expect(app.timers.getSnapshot().status).toBe('ready'));
    app.view.unmount();

    await app.timers.start({
      topicId: TOPIC,
      plannedMinutes: 25,
      rules: { minValidMinutes: 5, maxPauseMinutes: 30 },
    });
    await app.coordinator.idle();

    expect(app.pending.size).toBe(0);
  });
});
