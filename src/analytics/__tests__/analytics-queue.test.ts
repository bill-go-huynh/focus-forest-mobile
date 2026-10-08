import { HttpError, NetworkError } from '../../api/errors';
import { memoryStorage } from '../../test-utils/storage';
import { analyticsKey, AnalyticsQueue, QUEUE_MAX, type QueuedEvent } from '../analytics-queue';

const USER = 'user-1';

function setup(options: { send?: (events: QueuedEvent[]) => Promise<unknown> } = {}) {
  const storage = memoryStorage();
  let n = 0;
  let now = Date.parse('2026-10-08T09:00:00.000Z');
  const sent: QueuedEvent[][] = [];
  const send = jest.fn(
    options.send ??
      (async (events: QueuedEvent[]) => {
        sent.push(events);
        return { accepted: events.length, ignored: 0 };
      }),
  );
  const queue = new AnalyticsQueue({
    storage,
    send,
    now: () => new Date(now),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    platform: 'ios',
    appVersion: '0.1.0',
    localDateOf: (date) => date.toISOString().slice(0, 10),
  });
  return { queue, storage, send, sent, advance: (ms: number) => (now += ms) };
}

describe('the analytics queue (CR.6)', () => {
  it('records only allowlisted events with whole-number props, and sends them in order', async () => {
    const { queue, sent } = setup();
    await queue.activate(USER);
    queue.setSharing(true);
    await queue.record('app_opened');
    await queue.record('focus_started', { plannedMinutes: 25 });
    await queue.flush();
    expect(sent).toEqual([
      [
        expect.objectContaining({ name: 'app_opened', localDate: '2026-10-08', platform: 'ios' }),
        expect.objectContaining({ name: 'focus_started', props: { plannedMinutes: 25 } }),
      ],
    ]);
    expect(queue.size()).toBe(0);
  });

  it('keeps events across a relaunch until the server took them', async () => {
    const first = setup({ send: () => Promise.reject(new NetworkError()) });
    await first.queue.activate(USER);
    first.queue.setSharing(true);
    await first.queue.record('app_opened');
    await first.queue.flush();
    expect(first.queue.size()).toBe(1);
    expect(first.storage.data.get(analyticsKey(USER))).toContain('app_opened');

    const relaunch = new AnalyticsQueue({
      storage: first.storage,
      send: async (events) => ({ accepted: events.length, ignored: 0 }),
      now: () => new Date('2026-10-08T10:00:00.000Z'),
      newId: () => '00000000-0000-4000-8000-000000000099',
      platform: 'ios',
      appVersion: '0.1.0',
      localDateOf: (date) => date.toISOString().slice(0, 10),
    });
    await relaunch.activate(USER);
    relaunch.setSharing(true);
    expect(relaunch.size()).toBe(1);
    await relaunch.flush();
    expect(relaunch.size()).toBe(0);
  });

  it('sends at most 50 at a time, and stops on a failure without losing anything', async () => {
    let calls = 0;
    const { queue, send } = setup({
      send: async (events) => {
        calls += 1;
        if (calls === 2) throw new NetworkError();
        return { accepted: events.length, ignored: 0 };
      },
    });
    await queue.activate(USER);
    queue.setSharing(true);
    for (let i = 0; i < 120; i += 1) await queue.record('app_foregrounded');
    await queue.flush();
    expect(send.mock.calls.map(([events]) => events.length)).toEqual([50, 50]);
    expect(queue.size()).toBe(70);
  });

  it('drops a batch the server refuses as malformed, so one bad event never blocks the rest', async () => {
    const { queue } = setup({
      send: () => Promise.reject(new HttpError(400, { statusCode: 400, message: 'bad' })),
    });
    await queue.activate(USER);
    queue.setSharing(true);
    await queue.record('app_opened');
    await queue.flush();
    expect(queue.size()).toBe(0);
  });

  it('keeps the batch when signed out or the server fails', async () => {
    for (const error of [new HttpError(401, {}), new HttpError(503, {})]) {
      const { queue } = setup({ send: () => Promise.reject(error) });
      await queue.activate(USER);
      queue.setSharing(true);
      await queue.record('app_opened');
      await queue.flush();
      expect(queue.size()).toBe(1);
    }
  });

  it(`keeps at most ${QUEUE_MAX} events, dropping the oldest`, async () => {
    const { queue } = setup({ send: () => Promise.reject(new NetworkError()) });
    await queue.activate(USER);
    queue.setSharing(true);
    for (let i = 0; i < QUEUE_MAX + 5; i += 1) await queue.record('app_foregrounded');
    expect(queue.size()).toBe(QUEUE_MAX);
    expect(queue.peek()[0]?.id).toBe('00000000-0000-4000-8000-000000000006');
  });

  it('holds events while sharing is unknown, sends nothing, and forgets them once it is off', async () => {
    const { queue, send, storage } = setup();
    await queue.activate(USER);
    await queue.record('app_opened');
    await queue.flush();
    expect(send).not.toHaveBeenCalled();
    expect(queue.size()).toBe(1);
    queue.setSharing(false);
    expect(queue.size()).toBe(0);
    await queue.record('app_foregrounded');
    expect(queue.size()).toBe(0);
    await queue.flush();
    expect(send).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(storage.data.get(analyticsKey(USER)) ?? '[]').not.toContain('app_');
  });

  it('keeps a launch screen’s event until the user is known, at the time it happened', async () => {
    const { queue, advance } = setup({ send: () => Promise.reject(new NetworkError()) });
    await queue.record('forest_opened');
    expect(queue.size()).toBe(0);
    advance(5_000);
    await queue.activate(USER);
    expect(queue.peek().map((event) => [event.name, event.occurredAt])).toEqual([
      ['forest_opened', '2026-10-08T09:00:00.000Z'],
    ]);
  });

  it('records nothing after a sign-out, and forgets the user’s events', async () => {
    const { queue, storage } = setup({ send: () => Promise.reject(new NetworkError()) });
    await queue.activate(USER);
    queue.setSharing(true);
    await queue.record('app_opened');
    await queue.signOut();
    expect(queue.size()).toBe(0);
    expect(storage.data.has(analyticsKey(USER))).toBe(false);
    await queue.record('forest_opened');
    await queue.activate('user-2');
    expect(queue.size()).toBe(0);
  });

  it('counts a return to the app at most once per 30 minutes', async () => {
    const { queue, advance } = setup({ send: () => Promise.reject(new NetworkError()) });
    await queue.activate(USER);
    queue.setSharing(true);
    await queue.foregrounded();
    advance(10 * 60_000);
    await queue.foregrounded();
    advance(25 * 60_000);
    await queue.foregrounded();
    expect(queue.peek().map((event) => event.name)).toEqual([
      'app_foregrounded',
      'app_foregrounded',
    ]);
  });

  it('never fails the app when an id cannot be made', async () => {
    const storage = memoryStorage();
    const queue = new AnalyticsQueue({
      storage,
      send: async () => ({ accepted: 0, ignored: 0 }),
      now: () => new Date('2026-10-08T09:00:00.000Z'),
      newId: () => {
        throw new Error('no generator');
      },
      platform: 'ios',
      appVersion: '0.1.0',
      localDateOf: (date) => date.toISOString().slice(0, 10),
    });
    await queue.activate(USER);
    await expect(queue.record('app_opened')).resolves.toBeUndefined();
    expect(queue.size()).toBe(0);
  });

  it('keeps an event recorded while the stored queue is still being read', async () => {
    const storage = memoryStorage({
      [analyticsKey(USER)]: JSON.stringify([
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'app_opened',
          occurredAt: '2026-10-07T09:00:00.000Z',
          localDate: '2026-10-07',
          platform: 'ios',
          appVersion: '0.1.0',
          props: {},
        },
      ]),
    });
    let release: () => void = () => undefined;
    const slow = {
      ...storage,
      getItem: (key: string) =>
        new Promise<string | null>((resolve) => {
          release = () => resolve(storage.data.get(key) ?? null);
        }),
    };
    const queue = new AnalyticsQueue({
      storage: slow,
      send: () => Promise.reject(new NetworkError()),
      now: () => new Date('2026-10-08T09:00:00.000Z'),
      newId: () => '00000000-0000-4000-8000-000000000002',
      platform: 'ios',
      appVersion: '0.1.0',
      localDateOf: (date) => date.toISOString().slice(0, 10),
    });
    const activating = queue.activate(USER);
    const recording = queue.record('forest_opened');
    release();
    await activating;
    await recording;
    expect(queue.peek().map((event) => event.name)).toEqual(['app_opened', 'forest_opened']);
  });

  it('keeps only whole numbers of the event’s own props, never text or other keys', async () => {
    const { queue } = setup({ send: () => Promise.reject(new NetworkError()) });
    await queue.activate(USER);
    await queue.record('focus_started', { plannedMinutes: 2.5, topicId: 3 });
    await queue.record('focus_started', {
      plannedMinutes: 'twenty' as unknown as number,
    });
    await queue.record('recap_opened', { year: 2026, month: 9 });
    expect(queue.peek().map((event) => event.props)).toEqual([{}, {}, { year: 2026, month: 9 }]);
  });
});
