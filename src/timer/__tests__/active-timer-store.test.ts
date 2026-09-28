import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  activeTimerKey,
  ActiveTimerStore,
  type KeyValueStorage,
  type TimerStorageIssue,
} from '../active-timer-store';
import { derive, type SessionRules, type TimerState } from '../timer-engine';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const RULES: SessionRules = { minValidMinutes: 5, maxPauseMinutes: 30 };
const TOPIC = '5d1c3f5e-2a4b-4c6d-8e7f-9a0b1c2d3e4f';
const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '22222222-2222-4222-8222-222222222222';
const MINUTE = 60_000;

const at = (time: string) => Date.parse(`2026-09-27T${time.length === 5 ? `${time}:00` : time}Z`);

/** A device's key-value storage that outlives app instances, with failures on demand. */
function deviceStorage() {
  const data = new Map<string, string>();
  const failing = { setItem: false, getItem: false, removeItem: false };
  const storage: KeyValueStorage & { data: Map<string, string>; failing: typeof failing } = {
    data,
    failing,
    getItem: jest.fn(async (key: string) => {
      if (failing.getItem) throw new Error('read failed');
      return data.get(key) ?? null;
    }),
    setItem: jest.fn(async (key: string, value: string) => {
      if (failing.setItem) throw new Error('write failed');
      data.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      if (failing.removeItem) throw new Error('remove failed');
      data.delete(key);
    }),
  };
  return storage;
}

/** One app process: a fresh store over the device storage, with its own clock. */
function launch(storage: KeyValueStorage, time = '10:00', ids: string[] = []) {
  const clock = { now: at(time) };
  const issues: TimerStorageIssue[] = [];
  let n = 0;
  const store = new ActiveTimerStore({
    storage,
    now: () => clock.now,
    createId: () => ids[n++] ?? `0192f1a2-3b4c-7d5e-8f60-${String(n).padStart(12, '0')}`,
    report: (issue) => issues.push(issue),
  });
  return {
    store,
    issues,
    setTime: (next: string) => {
      clock.now = at(next);
    },
  };
}

const storedTimer = (
  storage: ReturnType<typeof deviceStorage>,
  userId = ADA,
): TimerState | null => {
  const raw = storage.data.get(activeTimerKey(userId));
  return raw === undefined ? null : (JSON.parse(raw) as TimerState);
};

async function startedApp(storage = deviceStorage(), plannedMinutes = 25) {
  const app = launch(storage);
  await app.store.activate(ADA);
  const result = await app.store.start({ topicId: TOPIC, plannedMinutes, rules: RULES });
  if (!result.ok) throw new Error(result.reason);
  return { ...app, storage };
}

describe('persisting every transition', () => {
  it('stores the timer when it starts, then after each pause, resume, and end', async () => {
    const { store, storage, setTime } = await startedApp();
    expect(storedTimer(storage)).toEqual(store.getSnapshot().timer);
    expect(storedTimer(storage)?.startedAt).toBe(at('10:00'));

    setTime('10:05');
    await store.pause();
    expect(storedTimer(storage)?.pausedAt).toBe(at('10:05'));

    setTime('10:07');
    await store.resume();
    expect(storedTimer(storage)?.pauses).toEqual([
      { startedAt: at('10:05'), endedAt: at('10:07') },
    ]);

    setTime('10:12');
    await store.end();
    expect(storedTimer(storage)?.finished).toEqual({ at: at('10:12'), reason: 'ended' });
    expect(storedTimer(storage)).toEqual(store.getSnapshot().timer);
  });

  it('writes nothing while time passes, however often the timer is read or refreshed', async () => {
    const { store, storage, setTime } = await startedApp();
    const writes = (storage.setItem as jest.Mock).mock.calls.length;

    for (const time of ['10:01', '10:02', '10:10', '10:24:59.999']) {
      setTime(time);
      derive(store.getSnapshot().timer!, at(time));
      await store.refresh();
    }

    expect((storage.setItem as jest.Mock).mock.calls.length).toBe(writes);
  });

  it('stores the completion found by a refresh, at the completion instant', async () => {
    const { store, storage, setTime } = await startedApp();
    setTime('10:40');

    await store.refresh();

    expect(storedTimer(storage)?.finished).toEqual({ at: at('10:25'), reason: 'completed' });
  });

  it('stores the completion when a pause is refused because the session already completed', async () => {
    const { store, storage, setTime } = await startedApp();
    setTime('10:40');

    const result = await store.pause();

    expect(result).toMatchObject({ ok: false, reason: 'finished' });
    expect(storedTimer(storage)?.finished).toEqual({ at: at('10:25'), reason: 'completed' });
    expect(store.getSnapshot().timer?.finished?.at).toBe(at('10:25'));
  });

  it('stores lowercase ids', async () => {
    const storage = deviceStorage();
    const app = launch(storage, '10:00', ['0192F1A2-3B4C-7D5E-8F60-718293A4B5C6']);
    await app.store.activate(ADA);

    await app.store.start({ topicId: TOPIC.toUpperCase(), plannedMinutes: 25, rules: RULES });

    expect(storedTimer(storage)).toMatchObject({
      id: '0192f1a2-3b4c-7d5e-8f60-718293a4b5c6',
      topicId: TOPIC,
    });
  });
});

describe('restoring after the app was killed', () => {
  it('is still running before the completion, with the right time left', async () => {
    const { storage } = await startedApp();

    const next = launch(storage, '10:10');
    await next.store.activate(ADA);

    const timer = next.store.getSnapshot().timer!;
    expect(derive(timer, at('10:10'))).toMatchObject({
      mode: 'running',
      remainingMilliseconds: 15 * MINUTE,
    });
  });

  it('finishes at the completion instant, not the reopening time, and stores that first', async () => {
    const { storage } = await startedApp();

    const next = launch(storage, '14:00');
    const snapshot = await next.store.activate(ADA);

    expect(snapshot.timer?.finished).toEqual({ at: at('10:25'), reason: 'completed' });
    expect(storedTimer(storage)?.finished).toEqual({ at: at('10:25'), reason: 'completed' });
  });

  it('is still paused before the pause limit', async () => {
    const { store, storage, setTime } = await startedApp();
    setTime('10:05');
    await store.pause();

    const next = launch(storage, '10:30');
    await next.store.activate(ADA);

    expect(next.store.getSnapshot().timer).toMatchObject({ pausedAt: at('10:05'), finished: null });
  });

  it('ends at the exact pause-limit instant once the limit has passed, and stores it', async () => {
    const { store, storage, setTime } = await startedApp(deviceStorage(), 60);
    setTime('10:05');
    await store.pause();

    const next = launch(storage, '13:00');
    await next.store.activate(ADA);

    const expected = { at: at('10:35'), reason: 'pause_limit' };
    expect(next.store.getSnapshot().timer?.finished).toEqual(expected);
    expect(storedTimer(storage)?.finished).toEqual(expected);
    expect(storedTimer(storage)?.pauses).toEqual([
      { startedAt: at('10:05'), endedAt: at('10:35') },
    ]);
  });

  it('keeps the same end instant through repeated kills', async () => {
    const { storage } = await startedApp();

    const second = launch(storage, '12:00');
    await second.store.activate(ADA);
    const third = launch(storage, '20:00');
    await third.store.activate(ADA);

    expect(third.store.getSnapshot().timer).toEqual(second.store.getSnapshot().timer);
    expect(third.store.getSnapshot().timer?.finished?.at).toBe(at('10:25'));
  });

  it('keeps a finished timer instead of clearing it', async () => {
    const { store, storage, setTime } = await startedApp();
    setTime('10:12');
    await store.end();

    const next = launch(storage, '18:00');
    await next.store.activate(ADA);

    expect(next.store.getSnapshot().timer?.finished).toEqual({ at: at('10:12'), reason: 'ended' });
  });

  it('works with AsyncStorage itself', async () => {
    await AsyncStorage.clear();
    const first = launch(AsyncStorage);
    await first.store.activate(ADA);
    await first.store.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });

    const next = launch(AsyncStorage, '11:00');
    await next.store.activate(ADA);

    expect(next.store.getSnapshot().timer?.finished).toEqual({
      at: at('10:25'),
      reason: 'completed',
    });
    expect(JSON.parse((await AsyncStorage.getItem(activeTimerKey(ADA)))!)).toEqual(
      next.store.getSnapshot().timer,
    );
  });
});

describe('one timer per user', () => {
  it("never shows one user's timer to another", async () => {
    const { storage } = await startedApp();

    const next = launch(storage, '10:10');
    await next.store.activate(GRACE);

    expect(next.store.getSnapshot()).toMatchObject({ status: 'ready', userId: GRACE, timer: null });
  });

  it('keeps a timer through sign-out and a switch to another user, for its user to find again', async () => {
    const { store, storage } = await startedApp();
    const before = store.getSnapshot().timer;

    store.deactivate();
    expect(store.getSnapshot()).toEqual({ status: 'inactive', userId: null, timer: null });
    await store.activate(GRACE);
    await store.start({ topicId: TOPIC, plannedMinutes: 45, rules: RULES });
    store.deactivate();
    await store.activate(ADA);

    expect(store.getSnapshot().timer).toEqual(before);
    expect(storedTimer(storage, ADA)).toEqual(before);
    expect(storedTimer(storage, GRACE)?.plannedMinutes).toBe(45);
  });

  it('refuses to start over an existing timer, running or finished', async () => {
    const { store, storage, setTime } = await startedApp();
    const existing = storedTimer(storage);

    const whileRunning = await store.start({ topicId: TOPIC, plannedMinutes: 45, rules: RULES });
    setTime('10:12');
    await store.end();
    const afterEnd = await store.start({ topicId: TOPIC, plannedMinutes: 45, rules: RULES });

    expect(whileRunning).toMatchObject({ ok: false, reason: 'timer_exists' });
    expect(afterEnd).toMatchObject({ ok: false, reason: 'timer_exists' });
    expect(storedTimer(storage)?.id).toBe(existing?.id);
  });

  it('refuses to act before a user is active or restored', async () => {
    const { store } = launch(deviceStorage());
    expect(await store.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES })).toMatchObject({
      ok: false,
      reason: 'not_ready',
    });
    expect(await store.pause()).toMatchObject({ ok: false, reason: 'not_ready' });
  });

  it('answers no_timer when there is nothing to pause', async () => {
    const { store } = launch(deviceStorage());
    await store.activate(ADA);
    expect(await store.pause()).toEqual({ ok: false, reason: 'no_timer', timer: null });
  });
});

describe('storage failures', () => {
  it('does not report a start that could not be stored, and holds no timer', async () => {
    const storage = deviceStorage();
    const { store, issues } = launch(storage);
    await store.activate(ADA);
    storage.failing.setItem = true;

    const result = await store.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES });

    expect(result).toEqual({ ok: false, reason: 'storage_failed', timer: null });
    expect(store.getSnapshot().timer).toBeNull();
    expect(storedTimer(storage)).toBeNull();
    expect(issues).toEqual([{ code: 'write_failed' }]);
  });

  it('keeps the last stored state in memory when a pause cannot be stored', async () => {
    const { store, storage, setTime } = await startedApp();
    const before = store.getSnapshot().timer;
    storage.failing.setItem = true;
    setTime('10:05');

    const result = await store.pause();

    expect(result).toEqual({ ok: false, reason: 'storage_failed', timer: before });
    expect(store.getSnapshot().timer).toEqual(before);
    expect(storedTimer(storage)).toEqual(before);
  });

  it('still shows the right end when the settled state cannot be stored on restore', async () => {
    const { storage } = await startedApp();
    storage.failing.setItem = true;

    const next = launch(storage, '14:00');
    await next.store.activate(ADA);

    const timer = next.store.getSnapshot().timer!;
    expect(derive(timer, at('14:00'))).toMatchObject({ mode: 'finished', endedAt: at('10:25') });
    expect(next.issues).toEqual([{ code: 'write_failed' }]);
  });

  it('refuses to start when the stored timer could not be read, so it is never overwritten', async () => {
    const { storage } = await startedApp();
    storage.failing.getItem = true;

    const next = launch(storage, '10:10');
    const snapshot = await next.store.activate(ADA);
    const result = await next.store.start({ topicId: TOPIC, plannedMinutes: 45, rules: RULES });

    expect(snapshot.status).toBe('unavailable');
    expect(result).toMatchObject({ ok: false, reason: 'not_ready' });
    expect(storedTimer(storage)?.plannedMinutes).toBe(25);
    expect(next.issues).toEqual([{ code: 'read_failed' }]);

    storage.failing.getItem = false;
    await next.store.activate(ADA);
    expect(next.store.getSnapshot().timer?.plannedMinutes).toBe(25);
  });
});

describe('corrupt stored state', () => {
  const valid = async () => {
    const { storage } = await startedApp();
    return { storage, raw: storage.data.get(activeTimerKey(ADA))! };
  };

  const cases: [string, TimerStorageIssue['code'], (raw: string) => string][] = [
    ['malformed JSON', 'corrupt_json', (raw) => raw.slice(0, -3)],
    [
      'an unsupported version',
      'unsupported_version',
      (raw) => raw.replace('"version":1', '"version":2'),
    ],
    ['an invalid id', 'invalid_state', (raw) => raw.replace(/"id":"[^"]+"/, '"id":"session-1"')],
    [
      'a bad timestamp',
      'invalid_state',
      (raw) => raw.replace(/"startedAt":\d+/, '"startedAt":"soon"'),
    ],
    [
      'overlapping pauses',
      'invalid_state',
      (raw) =>
        raw.replace(
          '"pauses":[]',
          `"pauses":[{"startedAt":${at('10:01')},"endedAt":${at('10:03')}},{"startedAt":${at('10:02')},"endedAt":${at('10:04')}}]`,
        ),
    ],
    [
      'an open pause before a closed one ends',
      'invalid_state',
      (raw) =>
        raw
          .replace(
            '"pauses":[]',
            `"pauses":[{"startedAt":${at('10:01')},"endedAt":${at('10:03')}}]`,
          )
          .replace('"pausedAt":null', `"pausedAt":${at('10:02')}`),
    ],
    [
      'an invalid finish',
      'invalid_state',
      (raw) => raw.replace('"finished":null', `"finished":{"at":${at('09:00')},"reason":"ended"}`),
    ],
  ];

  it.each(cases)(
    'moves %s aside, reports it, and starts with no timer',
    async (_case, code, corrupt) => {
      const { storage, raw } = await valid();
      const broken = corrupt(raw);
      expect(broken).not.toBe(raw);
      storage.data.set(activeTimerKey(ADA), broken);

      const next = launch(storage, '10:10');
      const snapshot = await next.store.activate(ADA);

      expect(snapshot).toEqual({ status: 'ready', userId: ADA, timer: null });
      expect(storage.data.has(activeTimerKey(ADA))).toBe(false);
      expect(storage.data.get(`${activeTimerKey(ADA)}/quarantine`)).toBe(broken);
      expect(next.issues).toEqual([{ code }]);
    },
  );

  it('never puts the raw stored value in a report', async () => {
    const { storage } = await valid();
    storage.data.set(activeTimerKey(ADA), '{"secret":"do not log me"');

    const next = launch(storage);
    await next.store.activate(ADA);

    expect(JSON.stringify(next.issues)).not.toContain('do not log me');
  });

  it('boots cleanly the next time, and can start a new timer', async () => {
    const { storage } = await valid();
    storage.data.set(activeTimerKey(ADA), 'not json');
    await launch(storage).store.activate(ADA);

    const next = launch(storage, '11:00');
    await next.store.activate(ADA);

    expect(next.issues).toEqual([]);
    expect(
      await next.store.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES }),
    ).toMatchObject({
      ok: true,
    });
  });
});

describe('a clock that moved backwards', () => {
  it('refuses the action and keeps the stored state as it was', async () => {
    const { store, storage, setTime } = await startedApp();
    setTime('10:05');
    await store.pause();
    const before = storedTimer(storage);
    const writes = (storage.setItem as jest.Mock).mock.calls.length;

    setTime('10:01');
    const resumed = await store.resume();
    const ended = await store.end();

    expect(resumed).toMatchObject({ ok: false, reason: 'time_went_backwards' });
    expect(ended).toMatchObject({ ok: false, reason: 'time_went_backwards' });
    expect(storedTimer(storage)).toEqual(before);
    expect(store.getSnapshot().timer).toEqual(before);
    expect((storage.setItem as jest.Mock).mock.calls.length).toBe(writes);
  });

  it('accepts the action again once the clock is past the last event', async () => {
    const { store, setTime } = await startedApp();
    setTime('10:05');
    await store.pause();
    setTime('10:01');
    await store.resume();

    setTime('10:06');
    expect(await store.resume()).toMatchObject({ ok: true });
  });
});

describe('overlapping calls', () => {
  it('applies quick successive actions in order', async () => {
    const { store, storage, setTime } = await startedApp();
    setTime('10:05');
    const paused = store.pause();
    const resumed = store.resume();

    expect(await paused).toMatchObject({ ok: true });
    expect(await resumed).toMatchObject({ ok: true });
    expect(storedTimer(storage)?.pauses).toEqual([
      { startedAt: at('10:05'), endedAt: at('10:05') },
    ]);
  });

  it("does not show a user's timer after switching away while it was restoring", async () => {
    const { storage } = await startedApp();
    const next = launch(storage, '10:10');

    const restoring = next.store.activate(ADA);
    next.store.deactivate();
    await restoring;

    expect(next.store.getSnapshot()).toEqual({ status: 'inactive', userId: null, timer: null });
  });

  it('notifies subscribers of every change', async () => {
    const { store, setTime } = await startedApp();
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getSnapshot().timer?.pausedAt ? 'paused' : 'other'));

    setTime('10:05');
    await store.pause();

    expect(seen).toContain('paused');
  });
});

describe('clearing a finished timer once it is handed off', () => {
  async function finishedApp() {
    const app = await startedApp();
    app.setTime('10:12');
    await app.store.end();
    return { ...app, id: app.store.getSnapshot().timer!.id };
  }

  it('removes it from storage first, then from memory, and lets a new timer start', async () => {
    const { store, storage, id } = await finishedApp();

    const result = await store.clearFinished(id);

    expect(result).toEqual({ ok: true });
    expect(storage.data.has(activeTimerKey(ADA))).toBe(false);
    expect(store.getSnapshot()).toEqual({ status: 'ready', userId: ADA, timer: null });
    await expect(
      store.start({ topicId: TOPIC, plannedMinutes: 25, rules: RULES }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('stays cleared after a kill', async () => {
    const { store, storage, id } = await finishedApp();
    await store.clearFinished(id);

    const relaunched = launch(storage, '11:00');
    await relaunched.store.activate(ADA);

    expect(relaunched.store.getSnapshot().timer).toBeNull();
  });

  it.each([
    ['running', async (app: Awaited<ReturnType<typeof startedApp>>) => app],
    [
      'paused',
      async (app: Awaited<ReturnType<typeof startedApp>>) => {
        app.setTime('10:05');
        await app.store.pause();
        return app;
      },
    ],
  ])('never clears a %s timer', async (_mode, prepare) => {
    const app = await prepare(await startedApp());
    const before = app.store.getSnapshot().timer!;

    const result = await app.store.clearFinished(before.id);

    expect(result).toEqual({ ok: false, reason: 'not_finished' });
    expect(app.store.getSnapshot().timer).toBe(before);
    expect(storedTimer(app.storage)).toEqual(before);
  });

  it('never clears a timer with another id', async () => {
    const { store, storage } = await finishedApp();
    const before = store.getSnapshot().timer;

    const result = await store.clearFinished('0192f1a2-3b4c-7d5e-8f60-ffffffffffff');

    expect(result).toEqual({ ok: false, reason: 'timer_mismatch' });
    expect(store.getSnapshot().timer).toBe(before);
    expect(storedTimer(storage)).toEqual(before);
  });

  it('answers no_timer when there is nothing to clear, and not_ready before a user is restored', async () => {
    const { store, id } = await finishedApp();
    await store.clearFinished(id);
    await expect(store.clearFinished(id)).resolves.toEqual({ ok: false, reason: 'no_timer' });

    const idle = launch(deviceStorage());
    await expect(idle.store.clearFinished(id)).resolves.toEqual({ ok: false, reason: 'not_ready' });
  });

  it('keeps the timer in memory and storage when the removal fails, and says so', async () => {
    const { store, storage, issues, id } = await finishedApp();
    const before = store.getSnapshot().timer;
    storage.failing.removeItem = true;

    const result = await store.clearFinished(id);

    expect(result).toEqual({ ok: false, reason: 'storage_failed' });
    expect(store.getSnapshot().timer).toBe(before);
    expect(storedTimer(storage)).toEqual(before);
    expect(issues).toContainEqual({ code: 'remove_failed' });
  });

  it("does not clear the next user's memory when the user switched during the removal", async () => {
    const { store, storage, id } = await finishedApp();
    let release: (() => void) | null = null;
    (storage.removeItem as jest.Mock).mockImplementationOnce(async (key: string) => {
      await new Promise<void>((resolve) => (release = resolve));
      storage.data.delete(key);
    });

    const clearing = store.clearFinished(id);
    while (!release) await Promise.resolve();
    store.deactivate();
    const other = store.activate(GRACE);
    (release as () => void)();
    await clearing;
    await other;

    expect(store.getSnapshot()).toEqual({ status: 'ready', userId: GRACE, timer: null });
  });
});
