import {
  HttpError,
  InvalidResponseError,
  NetworkError,
  UnauthenticatedError,
} from '../../api/errors';
import type { FocusSession } from '../../api/sessions';
import { quarantineKeyOf, type StorageIssue } from '../../common/stored-json';
import { makeSessionResult, makeSubmissionBody } from '../../test-utils/sessions';
import { memoryStorage } from '../../test-utils/storage';
import type { SessionSubmission, SessionSubmissionBody } from '../../timer/submission';
import { completionReceiptsKey, CompletionReceipts, receiptFor } from '../completion-receipts';
import { sessionOutboxKey, SessionOutbox } from '../session-outbox';

const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-09-27T10:30:00.000Z');
const OTHER_TOPIC = '6e2d4a6f-3b5c-4d7e-9f80-0b1c2d3e4f50';
const S1 = '0192f1a2-3b4c-7d5e-8f60-000000000001';
const S2 = '0192f1a2-3b4c-7d5e-8f60-000000000002';
const S3 = '0192f1a2-3b4c-7d5e-8f60-000000000003';

type Send = (id: string, payload: SessionSubmissionBody) => Promise<FocusSession>;
type Storage = ReturnType<typeof memoryStorage>;

const submission = (id: string, overrides: Partial<SessionSubmissionBody> = {}) =>
  ({ id, body: makeSubmissionBody(overrides) }) satisfies SessionSubmission;

/** Later sessions, so none of them overlap. */
const second = submission(S2, {
  startedAt: '2026-09-27T11:00:00.000Z',
  endedAt: '2026-09-27T11:25:00.000Z',
  pauseIntervals: [],
});
const third = submission(S3, {
  startedAt: '2026-09-27T12:00:00.000Z',
  endedAt: '2026-09-27T12:25:00.000Z',
  pauseIntervals: [],
});

/**
 * A server with A2.5 semantics: the first PUT of an id stores it (the answer's `endedAt` is
 * the server's effective end, not the submitted one), the same payload again is a replay,
 * another payload is `session_id_conflict`.
 */
function server() {
  const stored = new Map<string, string>();
  const payloads: { id: string; json: string }[] = [];
  const send = jest.fn<Promise<FocusSession>, [string, SessionSubmissionBody]>(
    async (id, payload) => {
      const json = JSON.stringify(payload);
      payloads.push({ id, json });
      const earlier = stored.get(id);
      if (earlier !== undefined && earlier !== json) throw coded(409, 'session_id_conflict');
      stored.set(id, json);
      return result(id, payload);
    },
  );
  return { send, stored, payloads };
}

/** The server's answer: its own effective end, which may differ from the raw end. */
const result = (id: string, payload: SessionSubmissionBody) =>
  makeSessionResult({
    id,
    topicId: payload.topicId,
    startedAt: payload.startedAt,
    endedAt: '2026-09-27T10:24:00.000Z',
  });

const coded = (status: number, code?: string) =>
  new HttpError(status, { statusCode: status, message: 'Whatever the text.', code });

function launch({
  storage = memoryStorage(),
  send = server().send as Send,
  synced = () => true,
  syncTopics = jest.fn(async () => undefined),
  onSynced = jest.fn(),
  keepReceipt,
}: {
  storage?: Storage;
  send?: Send;
  synced?: (topicId: string) => boolean;
  syncTopics?: jest.Mock<Promise<void>, []>;
  onSynced?: jest.Mock;
  keepReceipt?: (userId: string, session: FocusSession) => Promise<boolean>;
} = {}) {
  const issues: StorageIssue[] = [];
  const isTopicSynced = jest.fn(synced);
  const outbox = new SessionOutbox({
    storage,
    now: () => NOW,
    report: (issue) => issues.push(issue),
    send,
    isTopicSynced,
    syncTopics,
    onSynced,
    keepReceipt,
  });
  return { outbox, storage, issues, isTopicSynced, syncTopics, onSynced };
}

const storedDocument = (storage: Storage, userId = ADA) => {
  const raw = storage.data.get(sessionOutboxKey(userId));
  return raw === undefined ? null : (JSON.parse(raw) as { version: number; items: unknown[] });
};
const storedItems = (storage: Storage, userId = ADA) =>
  (storedDocument(storage, userId)?.items ?? []) as {
    id: string;
    payload: SessionSubmissionBody;
    state: string;
    reason: string | null;
  }[];

async function readyOutbox(options: Parameters<typeof launch>[0] = {}) {
  const app = launch(options);
  await app.outbox.activate(ADA);
  return app;
}

/** A send that waits for the test to answer it. */
function deferredSend() {
  const calls: {
    id: string;
    payload: SessionSubmissionBody;
    resolve: (s: FocusSession) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const send: Send = (id, payload) =>
    new Promise<FocusSession>((resolve, reject) => calls.push({ id, payload, resolve, reject }));
  return { send, calls };
}

const offline: Send = async () => {
  throw new NetworkError();
};

async function until(condition: () => boolean) {
  for (let i = 0; i < 100 && !condition(); i += 1) await Promise.resolve();
  if (!condition()) throw new Error('condition never met');
}

describe('queueing a finished session', () => {
  it('stores the exact submission before answering, as pending', async () => {
    const { outbox, storage } = await readyOutbox({ send: offline });
    const session = submission(S1);

    const queued = await outbox.enqueue(ADA, session);

    expect(queued).toEqual({ ok: true, replayed: false });
    expect(storedDocument(storage)).toEqual({
      version: 1,
      items: [{ id: S1, payload: session.body, state: 'pending', reason: null, queuedAt: NOW }],
    });
    expect(outbox.getSnapshot().items).toEqual(storedItems(storage));
  });

  it('keeps the payload byte for byte through a kill and relaunch', async () => {
    const { outbox, storage } = await readyOutbox({ send: offline });
    const session = submission(S1);
    await outbox.enqueue(ADA, session);

    const relaunched = launch({ storage, send: offline });
    await relaunched.outbox.activate(ADA);

    const [item] = relaunched.outbox.getSnapshot().items;
    expect(item?.payload).toStrictEqual(session.body);
    expect(JSON.stringify(item?.payload)).toBe(JSON.stringify(session.body));
  });

  it('treats the same id with the same payload as a replay: one item, no write', async () => {
    const { outbox, storage } = await readyOutbox({ send: offline });
    await outbox.enqueue(ADA, submission(S1));
    const writes = (storage.setItem as jest.Mock).mock.calls.length;

    // A payload equal in value, built separately (as after a relaunch).
    const again = await outbox.enqueue(ADA, JSON.parse(JSON.stringify(submission(S1))));

    expect(again).toEqual({ ok: true, replayed: true });
    expect(storedItems(storage)).toHaveLength(1);
    expect((storage.setItem as jest.Mock).mock.calls.length).toBe(writes);
  });

  it('never overwrites a queued session with another payload under its id', async () => {
    const { outbox, storage } = await readyOutbox({ send: offline });
    const original = submission(S1);
    await outbox.enqueue(ADA, original);

    const changed = await outbox.enqueue(
      ADA,
      submission(S1, { endedAt: '2026-09-27T10:26:00.000Z' }),
    );

    expect(changed).toEqual({ ok: false, reason: 'id_conflict' });
    expect(storedItems(storage)).toEqual([expect.objectContaining({ payload: original.body })]);
  });

  it('refuses a submission it could never restore, and stores nothing', async () => {
    const { outbox, storage } = await readyOutbox({ send: offline });

    const queued = await outbox.enqueue(
      ADA,
      submission(S1, { endedAt: '2026-09-27T09:00:00.000Z' }),
    );

    expect(queued).toEqual({ ok: false, reason: 'invalid_submission' });
    expect(storedDocument(storage)).toBeNull();
  });

  it('refuses before a user is restored, and for anyone but the active user', async () => {
    const idle = launch({ send: offline });
    await expect(idle.outbox.enqueue(ADA, submission(S1))).resolves.toEqual({
      ok: false,
      reason: 'not_ready',
    });

    const { outbox, storage } = await readyOutbox({ send: offline });
    await expect(outbox.enqueue(GRACE, submission(S1))).resolves.toEqual({
      ok: false,
      reason: 'not_ready',
    });
    expect(storedDocument(storage, GRACE)).toBeNull();
  });

  it('answers storage_failed and shows nothing when the write fails', async () => {
    const { outbox, storage, issues } = await readyOutbox({ send: offline });
    storage.failing.setItem = true;

    const queued = await outbox.enqueue(ADA, submission(S1));

    expect(queued).toEqual({ ok: false, reason: 'storage_failed' });
    expect(outbox.getSnapshot().items).toEqual([]);
    expect(issues).toContainEqual({ code: 'write_failed' });
  });
});

describe('each user has their own outbox', () => {
  it("never shows or sends one user's sessions for another", async () => {
    const { send } = server();
    const { outbox, storage } = await readyOutbox({ send: offline });
    await outbox.enqueue(ADA, submission(S1));

    const other = launch({ storage, send });
    await other.outbox.activate(GRACE);
    await other.outbox.flush();

    expect(other.outbox.getSnapshot().items).toEqual([]);
    expect(send).not.toHaveBeenCalled();
    expect(storedItems(storage, ADA)).toHaveLength(1);
  });

  it('keeps the sessions through sign-out, and sends them when the same user is back', async () => {
    const { send, stored } = server();
    const { outbox, storage } = await readyOutbox({ send: offline });
    await outbox.enqueue(ADA, submission(S1));
    outbox.deactivate();
    expect(outbox.getSnapshot()).toEqual({
      status: 'inactive',
      userId: null,
      items: [],
      synced: {},
    });
    expect(storedItems(storage)).toHaveLength(1);

    const back = launch({ storage, send });
    await back.outbox.activate(ADA);
    await back.outbox.flush();

    expect(stored.has(S1)).toBe(true);
    expect(storedItems(storage)).toEqual([]);
  });
});

describe('a successful sync', () => {
  it('removes the session only after the answer is validated, and keeps the result in memory', async () => {
    const { outbox, storage } = await readyOutbox();
    const session = submission(S1);
    await outbox.enqueue(ADA, session);
    await outbox.flush();

    expect(storedItems(storage)).toEqual([]);
    expect(outbox.getSnapshot().items).toEqual([]);
    expect(outbox.getSnapshot().synced[S1]).toEqual(result(S1, session.body));
  });

  it("never replaces the raw end with the server's effective end", async () => {
    const pending = deferredSend();
    const { outbox, storage } = await readyOutbox({ send: pending.send });
    const session = submission(S1);
    await outbox.enqueue(ADA, session);
    const flushing = outbox.flush();
    await until(() => pending.calls.length === 1);

    // The answer is valid, but only the removal fails: any other write of the item would land.
    (storage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      if (!value.includes(S1)) throw new Error('write failed');
      storage.data.set(key, value);
    });
    pending.calls[0]!.resolve(result(S1, session.body));
    await flushing;

    expect(result(S1, session.body).endedAt).not.toBe(session.body.endedAt);
    expect(storedItems(storage)[0]?.payload).toStrictEqual(session.body);
    expect(outbox.getSnapshot().items[0]?.payload).toStrictEqual(session.body);
    expect(outbox.getSnapshot().synced).toEqual({});
  });

  it('keeps the session when its removal cannot be stored, and replays the same payload later', async () => {
    const srv = server();
    const { outbox, storage } = await readyOutbox({ send: srv.send });
    await outbox.enqueue(ADA, submission(S1));
    storage.failing.setItem = true;
    await outbox.flush();
    expect(storedItems(storage)).toHaveLength(1);

    storage.failing.setItem = false;
    const relaunched = launch({ storage, send: srv.send });
    await relaunched.outbox.activate(ADA);
    await relaunched.outbox.flush();

    expect(srv.payloads.map((p) => p.json)).toEqual([
      JSON.stringify(submission(S1).body),
      JSON.stringify(submission(S1).body),
    ]);
    expect(storedItems(storage)).toEqual([]);
    expect(srv.stored.size).toBe(1);
  });

  it('keeps a response that breaks the contract for attention, never drops it', async () => {
    const send = jest.fn(async () => {
      throw new InvalidResponseError();
    });
    const { outbox, storage } = await readyOutbox({ send });
    await outbox.enqueue(ADA, submission(S1));
    await outbox.flush();

    expect(storedItems(storage)).toEqual([
      expect.objectContaining({ id: S1, state: 'needs_attention', reason: 'invalid_response' }),
    ]);
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps an answer for another session id for attention', async () => {
    const send = jest.fn(async (_id: string, payload: SessionSubmissionBody) =>
      result(S2, payload),
    );
    const { outbox, storage } = await readyOutbox({ send });
    await outbox.enqueue(ADA, submission(S1));
    await outbox.flush();

    expect(storedItems(storage)).toEqual([
      expect.objectContaining({ id: S1, state: 'needs_attention', reason: 'invalid_response' }),
    ]);
    expect(outbox.getSnapshot().synced).toEqual({});
  });
});

describe('answers the app retries by itself, always with the same payload', () => {
  it.each([
    ['an unreachable server', () => new NetworkError()],
    ['a sign-in that could not be renewed (401)', () => new UnauthenticatedError()],
  ])('keeps it pending on %s and stops the flush there', async (_case, error) => {
    const send = jest.fn(async () => {
      throw error();
    });
    const { outbox, storage } = await readyOutbox({ send });
    await outbox.enqueue(ADA, submission(S1));
    await outbox.enqueue(ADA, second);
    send.mockClear();

    await outbox.flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(storedItems(storage).map((i) => i.state)).toEqual(['pending', 'pending']);
  });

  it('keeps it pending on a 5xx and goes on with the others', async () => {
    const srv = server();
    const send = jest.fn<Promise<FocusSession>, [string, SessionSubmissionBody]>(
      async (id, payload) => {
        if (id === S1) throw coded(503);
        return srv.send(id, payload);
      },
    );
    const { outbox, storage } = await readyOutbox({ send });
    await outbox.enqueue(ADA, submission(S1));
    await outbox.enqueue(ADA, second);
    await outbox.flush();

    expect(storedItems(storage)).toEqual([expect.objectContaining({ id: S1, state: 'pending' })]);
    expect(srv.stored.has(S2)).toBe(true);
  });

  it('resends exactly the same payload after ends_in_future, never a patched time', async () => {
    const srv = server();
    let serverCaughtUp = false;
    const send = jest.fn<Promise<FocusSession>, [string, SessionSubmissionBody]>(
      async (id, payload) => {
        if (!serverCaughtUp) throw coded(422, 'ends_in_future');
        return srv.send(id, payload);
      },
    );
    const { outbox, storage } = await readyOutbox({ send });
    const session = submission(S1);
    await outbox.enqueue(ADA, session);
    await outbox.enqueue(ADA, second);

    await outbox.flush();
    // Retryable, and the others are still tried.
    expect(send.mock.calls.map(([id]) => id)).toEqual([S1, S2]);
    expect(storedItems(storage).map((i) => [i.id, i.state])).toEqual([
      [S1, 'pending'],
      [S2, 'pending'],
    ]);

    serverCaughtUp = true;
    await outbox.flush();

    const sent = send.mock.calls.filter(([id]) => id === S1).map(([, p]) => JSON.stringify(p));
    expect(sent).toEqual([JSON.stringify(session.body), JSON.stringify(session.body)]);
    expect(storedItems(storage)).toEqual([]);
  });

  it('marks timezone_required blocked, keeps the payload, and retries it on a later flush', async () => {
    const srv = server();
    let timeZoneSet = false;
    const send = jest.fn<Promise<FocusSession>, [string, SessionSubmissionBody]>(
      async (id, payload) => {
        if (!timeZoneSet) throw coded(422, 'timezone_required');
        return srv.send(id, payload);
      },
    );
    const { outbox, storage } = await readyOutbox({ send });
    const session = submission(S1);
    await outbox.enqueue(ADA, session);
    await outbox.flush();

    expect(storedItems(storage)).toEqual([
      { id: S1, payload: session.body, state: 'blocked_timezone', reason: null, queuedAt: NOW },
    ]);

    timeZoneSet = true;
    await outbox.flush();
    expect(send.mock.calls.map(([id, p]) => [id, JSON.stringify(p)])).toEqual([
      [S1, JSON.stringify(session.body)],
      [S1, JSON.stringify(session.body)],
    ]);
    expect(storedItems(storage)).toEqual([]);
  });
});

describe('answers that need the user or a fix, kept and never retried automatically', () => {
  it.each([
    ['409 session_overlap', coded(409, 'session_overlap'), 'session_overlap'],
    ['409 session_id_conflict', coded(409, 'session_id_conflict'), 'session_id_conflict'],
    ['a 409 without a known code', coded(409), 'rejected'],
    ['422 invalid_time', coded(422, 'invalid_time'), 'rejected'],
    ['422 invalid_planned_duration', coded(422, 'invalid_planned_duration'), 'rejected'],
    ['422 ends_before_start', coded(422, 'ends_before_start'), 'rejected'],
    ['422 pause_ends_before_start', coded(422, 'pause_ends_before_start'), 'rejected'],
    ['422 pause_outside_session', coded(422, 'pause_outside_session'), 'rejected'],
    ['422 pauses_out_of_order', coded(422, 'pauses_out_of_order'), 'rejected'],
    ['422 pauses_overlap', coded(422, 'pauses_overlap'), 'rejected'],
    ['a 400', coded(400), 'rejected'],
  ])('keeps %s as needs_attention and goes on with the others', async (_case, error, reason) => {
    const srv = server();
    const send = jest.fn<Promise<FocusSession>, [string, SessionSubmissionBody]>(
      async (id, payload) => {
        if (id === S1) throw error;
        return srv.send(id, payload);
      },
    );
    const { outbox, storage } = await readyOutbox({ send });
    const session = submission(S1);
    await outbox.enqueue(ADA, session);
    await outbox.enqueue(ADA, second);

    await outbox.flush();
    await outbox.flush();

    expect(storedItems(storage)).toEqual([
      { id: S1, payload: session.body, state: 'needs_attention', reason, queuedAt: NOW },
    ]);
    expect(send.mock.calls.filter(([id]) => id === S1)).toHaveLength(1);
    expect(srv.stored.has(S2)).toBe(true);
  });
});

describe('sessions on a topic the server may not have yet', () => {
  it('does not send a session whose topic create is still queued, and sends the others', async () => {
    const srv = server();
    const { outbox, storage, syncTopics } = await readyOutbox({
      send: srv.send,
      synced: (topicId) => topicId !== OTHER_TOPIC,
    });
    await outbox.enqueue(ADA, submission(S1, { topicId: OTHER_TOPIC }));
    await outbox.enqueue(ADA, second);

    await outbox.flush();

    expect(srv.send.mock.calls.map(([id]) => id)).toEqual([S2]);
    expect(syncTopics).toHaveBeenCalledTimes(1);
    expect(storedItems(storage)).toEqual([
      expect.objectContaining({ id: S1, state: 'blocked_topic', reason: null }),
    ]);
  });

  it('sends it in the same flush once the topic queue has synced its topic', async () => {
    const srv = server();
    let topicSynced = false;
    const syncTopics = jest.fn(async () => {
      topicSynced = true;
    });
    const { outbox, storage } = await readyOutbox({
      send: srv.send,
      synced: (topicId) => topicId !== OTHER_TOPIC || topicSynced,
      syncTopics,
    });
    await outbox.enqueue(ADA, submission(S1, { topicId: OTHER_TOPIC }));

    await outbox.flush();

    expect(srv.stored.has(S1)).toBe(true);
    expect(storedItems(storage)).toEqual([]);
  });

  it('sends a blocked session on a later flush once its topic is synced', async () => {
    const srv = server();
    let topicSynced = false;
    const { outbox, storage } = await readyOutbox({
      send: srv.send,
      synced: (topicId) => topicId !== OTHER_TOPIC || topicSynced,
    });
    await outbox.enqueue(ADA, submission(S1, { topicId: OTHER_TOPIC }));
    await outbox.flush();
    expect(storedItems(storage)[0]?.state).toBe('blocked_topic');

    topicSynced = true;
    await outbox.flush();

    expect(srv.stored.has(S1)).toBe(true);
    expect(storedItems(storage)).toEqual([]);
  });

  it('marks a 404 (topic not found) blocked_topic and keeps it, without holding back the others', async () => {
    const srv = server();
    const send = jest.fn<Promise<FocusSession>, [string, SessionSubmissionBody]>(
      async (id, payload) => {
        if (id === S1) throw new HttpError(404, { statusCode: 404, message: 'Topic not found.' });
        return srv.send(id, payload);
      },
    );
    const { outbox, storage } = await readyOutbox({ send });
    await outbox.enqueue(ADA, submission(S1));
    await outbox.enqueue(ADA, second);

    await outbox.flush();

    expect(storedItems(storage)).toEqual([
      expect.objectContaining({ id: S1, state: 'blocked_topic' }),
    ]);
    expect(srv.stored.has(S2)).toBe(true);
  });

  it('asks the topic queue to sync at most once per flush', async () => {
    const { outbox, syncTopics } = await readyOutbox({
      send: server().send,
      synced: () => false,
    });
    await outbox.enqueue(ADA, submission(S1));
    await outbox.enqueue(ADA, second);
    await outbox.enqueue(ADA, third);

    await outbox.flush();

    expect(syncTopics).toHaveBeenCalledTimes(1);
  });
});

describe('one flush at a time', () => {
  it('shares one run between overlapping flushes: each session is sent once', async () => {
    const pending = deferredSend();
    const { outbox } = await readyOutbox({ send: pending.send });
    await outbox.enqueue(ADA, submission(S1));

    const first = outbox.flush();
    const second = outbox.flush();
    await until(() => pending.calls.length === 1);
    pending.calls[0]!.resolve(result(S1, submission(S1).body));
    await Promise.all([first, second]);

    expect(pending.calls).toHaveLength(1);
    expect(outbox.getSnapshot().items).toEqual([]);
  });

  it("never lets an answer for one user change the next user's outbox", async () => {
    const pending = deferredSend();
    const { outbox, storage } = await readyOutbox({ send: pending.send });
    await outbox.enqueue(ADA, submission(S1));
    const flushing = outbox.flush();
    await until(() => pending.calls.length === 1);

    outbox.deactivate();
    await outbox.activate(GRACE);
    await outbox.enqueue(GRACE, submission(S2));
    pending.calls[0]!.resolve(result(S1, submission(S1).body));
    await flushing;

    expect(outbox.getSnapshot().userId).toBe(GRACE);
    expect(outbox.getSnapshot().synced).toEqual({});
    expect(outbox.getSnapshot().items.map((i) => i.id)).toEqual([S2]);
    expect(storedItems(storage, GRACE).map((i) => i.id)).toEqual([S2]);
    // Ada's session is still hers, to be replayed (200) on her next flush.
    expect(storedItems(storage, ADA).map((i) => i.id)).toEqual([S1]);
  });
});

describe('a corrupt or unreadable outbox', () => {
  const valid = {
    id: S1,
    payload: makeSubmissionBody(),
    state: 'pending',
    reason: null,
    queuedAt: NOW,
  };

  it.each([
    ['malformed JSON', '{"version":1,"items":[', 'corrupt_json'],
    ['another version', JSON.stringify({ version: 2, items: [] }), 'unsupported_version'],
    [
      'an invalid submission',
      JSON.stringify({
        version: 1,
        items: [{ ...valid, payload: { ...valid.payload, endedAt: '2026-09-27T09:00:00.000Z' } }],
      }),
      'invalid_state',
    ],
    [
      'duplicate ids',
      JSON.stringify({ version: 1, items: [valid, { ...valid, queuedAt: NOW + 1 }] }),
      'invalid_state',
    ],
    [
      'an uppercase id',
      JSON.stringify({ version: 1, items: [{ ...valid, id: S1.toUpperCase() }] }),
      'invalid_state',
    ],
    [
      'an unknown state',
      JSON.stringify({ version: 1, items: [{ ...valid, state: 'syncing' }] }),
      'invalid_state',
    ],
    [
      'a reason on a pending session',
      JSON.stringify({ version: 1, items: [{ ...valid, reason: 'session_overlap' }] }),
      'invalid_state',
    ],
    [
      'needs_attention without a reason',
      JSON.stringify({ version: 1, items: [{ ...valid, state: 'needs_attention' }] }),
      'invalid_state',
    ],
    [
      'an extra field',
      JSON.stringify({ version: 1, items: [{ ...valid, attempts: 3 }] }),
      'invalid_state',
    ],
  ])(
    'quarantines %s, keeps a copy before removing it, and sends nothing',
    async (_c, raw, code) => {
      const storage = memoryStorage({ [sessionOutboxKey(ADA)]: raw });
      const srv = server();
      const { outbox, issues } = launch({ storage, send: srv.send });

      await outbox.activate(ADA);
      await outbox.flush();

      expect(outbox.getSnapshot()).toMatchObject({ status: 'ready', items: [] });
      expect(storage.data.get(quarantineKeyOf(sessionOutboxKey(ADA)))).toBe(raw);
      expect(storage.data.has(sessionOutboxKey(ADA))).toBe(false);
      expect(issues).toEqual([{ code }]);
      expect(srv.send).not.toHaveBeenCalled();
    },
  );

  it('keeps the corrupt entry and stays unavailable when no copy could be kept', async () => {
    const raw = '{"version":1,"items":[';
    const storage = memoryStorage({ [sessionOutboxKey(ADA)]: raw });
    storage.failing.setItemFor = (key) => key === quarantineKeyOf(sessionOutboxKey(ADA));
    const { outbox } = launch({ storage });

    await outbox.activate(ADA);

    expect(outbox.getSnapshot().status).toBe('unavailable');
    expect(storage.data.get(sessionOutboxKey(ADA))).toBe(raw);
    await expect(outbox.enqueue(ADA, submission(S1))).resolves.toEqual({
      ok: false,
      reason: 'not_ready',
    });
  });

  it('is unavailable when storage cannot be read, so nothing overwrites what may be there', async () => {
    const storage = memoryStorage();
    storage.failing.getItem = true;
    const { outbox } = launch({ storage });

    await outbox.activate(ADA);

    expect(outbox.getSnapshot().status).toBe('unavailable');
    await expect(outbox.enqueue(ADA, submission(S1))).resolves.toMatchObject({ ok: false });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('never puts the stored value in a report', async () => {
    const raw = JSON.stringify({ version: 1, items: [{ ...valid, id: 'secret-note' }] });
    const storage = memoryStorage({ [sessionOutboxKey(ADA)]: raw });
    const { outbox, issues } = launch({ storage });

    await outbox.activate(ADA);

    expect(JSON.stringify(issues)).not.toContain('secret-note');
  });
});

describe('telling the app a session synced (topic lists derive their last use from it)', () => {
  it('reports a stored session (201) once, after it has left the outbox', async () => {
    const onSynced = jest.fn();
    const { outbox, storage } = await readyOutbox({ onSynced });
    onSynced.mockImplementation(() => {
      expect(storedItems(storage)).toEqual([]);
    });
    const session = submission(S1);
    await outbox.enqueue(ADA, session);

    await outbox.flush();

    expect(onSynced).toHaveBeenCalledTimes(1);
    expect(onSynced).toHaveBeenCalledWith(ADA, result(S1, session.body));
  });

  it('reports a replay (200) the same way', async () => {
    const srv = server();
    await srv.send(S1, submission(S1).body);
    srv.send.mockClear();
    const { outbox, onSynced } = await readyOutbox({ send: srv.send });
    await outbox.enqueue(ADA, submission(S1));

    await outbox.flush();

    expect(srv.send).toHaveBeenCalledTimes(1);
    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an unreachable server', () => new NetworkError()],
    ['a 401', () => new UnauthenticatedError()],
    ['a 5xx', () => coded(503)],
    ['ends_in_future', () => coded(422, 'ends_in_future')],
    ['timezone_required', () => coded(422, 'timezone_required')],
    ['a 404', () => coded(404)],
    ['session_overlap', () => coded(409, 'session_overlap')],
    ['an evaluator rejection', () => coded(422, 'pauses_overlap')],
    ['an invalid response', () => new InvalidResponseError()],
  ])('does not report %s as a sync', async (_case, error) => {
    const send = jest.fn(async () => {
      throw error();
    });
    const { outbox, onSynced } = await readyOutbox({ send });
    await outbox.enqueue(ADA, submission(S1));

    await outbox.flush();

    expect(onSynced).not.toHaveBeenCalled();
  });

  it('does not report an answer for another session id', async () => {
    const send = jest.fn(async (_id: string, payload: SessionSubmissionBody) =>
      result(S2, payload),
    );
    const { outbox, onSynced } = await readyOutbox({ send });
    await outbox.enqueue(ADA, submission(S1));

    await outbox.flush();

    expect(onSynced).not.toHaveBeenCalled();
  });

  it('does not make the removal depend on the report: a failing report changes nothing', async () => {
    const srv = server();
    const onSynced = jest.fn(() => {
      throw new Error('refresh failed');
    });
    const { outbox, storage } = await readyOutbox({ send: srv.send, onSynced });
    await outbox.enqueue(ADA, submission(S1));
    await outbox.enqueue(ADA, second);

    await outbox.flush();
    await outbox.flush();

    expect(storedItems(storage)).toEqual([]);
    expect(Object.keys(outbox.getSnapshot().synced)).toEqual([S1, S2]);
    expect(srv.send.mock.calls.map(([id]) => id)).toEqual([S1, S2]);
  });

  it('reports a validated answer even when its removal could not be stored: the server has it', async () => {
    const { outbox, storage, onSynced } = await readyOutbox();
    await outbox.enqueue(ADA, submission(S1));
    storage.failing.setItem = true;

    await outbox.flush();

    expect(storedItems(storage)).toHaveLength(1);
    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it("never reports one user's session after switching to another", async () => {
    const pending = deferredSend();
    const { outbox, onSynced } = await readyOutbox({ send: pending.send });
    await outbox.enqueue(ADA, submission(S1));
    const flushing = outbox.flush();
    await until(() => pending.calls.length === 1);

    outbox.deactivate();
    await outbox.activate(GRACE);
    pending.calls[0]!.resolve(result(S1, submission(S1).body));
    await flushing;

    expect(onSynced).not.toHaveBeenCalled();
  });

  it("never reports one user's session when the switch happens while its removal is written", async () => {
    const { outbox, storage, onSynced } = await readyOutbox();
    await outbox.enqueue(ADA, submission(S1));
    let release: (() => void) | null = null;
    (storage.setItem as jest.Mock).mockImplementationOnce(async (key: string, value: string) => {
      await new Promise<void>((resolve) => (release = resolve));
      storage.data.set(key, value);
    });

    const flushing = outbox.flush();
    await until(() => release !== null);
    outbox.deactivate();
    await outbox.activate(GRACE);
    (release as unknown as () => void)();
    await flushing;

    expect(onSynced).not.toHaveBeenCalled();
    expect(outbox.getSnapshot()).toMatchObject({ userId: GRACE, items: [] });
    expect(outbox.getSnapshot().synced).toEqual({});
  });
});

describe('the completion receipt: kept before the session leaves the outbox', () => {
  /** Receipts over the same device storage, the way the app wires them. */
  async function withReceipts(storage: Storage, send: Send) {
    const receipts = new CompletionReceipts({ storage, report: () => undefined });
    await receipts.activate(ADA);
    const app = launch({ storage, send, keepReceipt: (userId, s) => receipts.keep(userId, s) });
    await app.outbox.activate(ADA);
    return { ...app, receipts };
  }
  const storedReceipts = (storage: Storage) =>
    (
      JSON.parse(storage.data.get(completionReceiptsKey(ADA)) ?? '{"receipts":[]}') as {
        receipts: FocusSession[];
      }
    ).receipts;

  it("stores the server's answer while the session is still queued, and only then removes it", async () => {
    const storage = memoryStorage();
    const queuedWhenKept: unknown[][] = [];
    const { outbox } = await readyOutbox({
      storage,
      keepReceipt: async () => {
        queuedWhenKept.push(storedItems(storage));
        return true;
      },
    });
    await outbox.enqueue(ADA, submission(S1));

    await outbox.flush();

    expect(queuedWhenKept).toEqual([[expect.objectContaining({ id: S1 })]]);
    expect(storedItems(storage)).toEqual([]);
  });

  it('keeps the session, unchanged, when its receipt cannot be stored; a replay stores it later', async () => {
    const srv = server();
    const storage = memoryStorage();
    storage.failing.setItemFor = (key) => key === completionReceiptsKey(ADA);
    const { outbox, receipts } = await withReceipts(storage, srv.send);
    await outbox.enqueue(ADA, submission(S1));
    await outbox.enqueue(ADA, second);

    await outbox.flush();

    // Both answered; neither left, and the next one was still tried.
    expect(srv.payloads.map((p) => p.id)).toEqual([S1, S2]);
    expect(storedItems(storage).map((item) => item.id)).toEqual([S1, S2]);
    expect(storedItems(storage)[0]?.payload).toStrictEqual(submission(S1).body);
    expect(storedItems(storage)[0]?.state).toBe('pending');
    expect(outbox.getSnapshot().synced).toEqual({});

    storage.failing.setItemFor = undefined;
    await outbox.flush();

    expect(srv.stored.size).toBe(2);
    expect(storedItems(storage)).toEqual([]);
    expect(storedReceipts(storage).map((r) => r.id)).toEqual([S1, S2]);
    expect(receiptFor(receipts.getSnapshot(), S1)?.id).toBe(S1);
  });

  it('keeps both when the receipt is stored but the removal is not; the replay adds no second receipt', async () => {
    const srv = server();
    const storage = memoryStorage();
    storage.failing.setItemFor = (key) => key === sessionOutboxKey(ADA);
    const { outbox } = await withReceipts(storage, srv.send);
    storage.failing.setItemFor = undefined;
    await outbox.enqueue(ADA, submission(S1));
    storage.failing.setItemFor = (key) => key === sessionOutboxKey(ADA);

    await outbox.flush();
    expect(storedItems(storage).map((item) => item.id)).toEqual([S1]);
    expect(storedReceipts(storage).map((r) => r.id)).toEqual([S1]);

    storage.failing.setItemFor = undefined;
    await outbox.flush();

    expect(srv.payloads).toHaveLength(2);
    expect(storedItems(storage)).toEqual([]);
    expect(storedReceipts(storage).map((r) => r.id)).toEqual([S1]);
  });

  it('keeps the receipt for the user whose session it is', async () => {
    const keepReceipt = jest.fn(async () => true);
    const { outbox } = await readyOutbox({ keepReceipt });
    await outbox.enqueue(ADA, submission(S1));
    await outbox.flush();

    expect(keepReceipt).toHaveBeenCalledWith(ADA, result(S1, submission(S1).body));
  });
});
