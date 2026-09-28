import { HttpError, InvalidResponseError, NetworkError, UnauthenticatedError } from '../../api';
import type { Topic } from '../../api/topics';
import type { StorageIssue } from '../../common/stored-json';
import { memoryStorage } from '../../test-utils/storage';
import { makeTopic } from '../../test-utils/topics';
import {
  canonicalCreatePayload,
  topicCreateQueueKey,
  TopicCreateQueue,
  type CreateTopicPayload,
} from '../topic-create-queue';

const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '22222222-2222-4222-8222-222222222222';
const NOW = Date.parse('2026-09-27T10:00:00.000Z');
const reading = { name: 'Reading', icon: 'book', color: 'topic.1' };
const piano = { name: 'Piano', icon: 'music', color: 'topic.2' };

type Send = (id: string, payload: CreateTopicPayload) => Promise<Topic>;

const conflict = (code: string) =>
  new HttpError(409, { statusCode: 409, message: 'Whatever the text.', code });

/** A server that creates once per id, like A2.2: the same payload again is a replay. */
function server() {
  const created = new Map<string, CreateTopicPayload>();
  const send = jest.fn<Promise<Topic>, [string, CreateTopicPayload]>(async (id, payload) => {
    const earlier = created.get(id);
    if (earlier && JSON.stringify(earlier) !== JSON.stringify(payload)) {
      throw conflict('topic_id_conflict');
    }
    created.set(id, payload);
    return makeTopic({ id, ...payload, lastUsedAt: null, lastPlannedMinutes: null });
  });
  return { send, created };
}

function launch({
  storage = memoryStorage(),
  send = server().send as Send,
  confirm = jest.fn(async (_userId: string, _topic: Topic) => true),
  ids = ['aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b'],
}: {
  storage?: ReturnType<typeof memoryStorage>;
  send?: Send;
  confirm?: jest.Mock<Promise<boolean>, [string, Topic]>;
  ids?: string[];
} = {}) {
  const issues: StorageIssue[] = [];
  let n = 0;
  const queue = new TopicCreateQueue({
    storage,
    now: () => NOW,
    createId: () => ids[n++] ?? `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`,
    report: (issue) => issues.push(issue),
    send,
    confirm,
  });
  return { queue, storage, issues, confirm };
}

const storedItems = (storage: ReturnType<typeof memoryStorage>, userId = ADA) => {
  const raw = storage.data.get(topicCreateQueueKey(userId));
  return raw ? (JSON.parse(raw).items as { id: string; state: string }[]) : [];
};

/** A send that waits for the test to answer it. */
function deferredSend() {
  const calls: {
    id: string;
    payload: CreateTopicPayload;
    resolve: (t: Topic) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const send: Send = (id, payload) =>
    new Promise<Topic>((resolve, reject) => calls.push({ id, payload, resolve, reject }));
  return { send, calls };
}

const offline: Send = async () => {
  throw new NetworkError();
};

describe('canonicalCreatePayload', () => {
  it('trims and composes text once, the way the API compares creates', () => {
    expect(canonicalCreatePayload({ ...reading, name: '  Café  ', description: '  \n ' })).toEqual({
      ...reading,
      name: 'Café',
      description: null,
    });
  });

  it('always sends a description, null when there is none', () => {
    expect(canonicalCreatePayload(reading)).toEqual({ ...reading, description: null });
    expect(canonicalCreatePayload({ ...reading, description: ' Novels ' })?.description).toBe(
      'Novels',
    );
  });

  it.each([
    ['a blank name', { ...reading, name: '   ' }],
    ['a color outside the palette', { ...reading, color: '#00ff00' }],
    ['no icon', { ...reading, icon: '' }],
  ])('refuses %s', (_case, fields) => {
    expect(canonicalCreatePayload(fields)).toBeNull();
  });
});

describe('enqueueing a create', () => {
  it('stores it before answering, with a lowercase id and the canonical payload', async () => {
    const { queue, storage } = launch({
      send: offline,
      ids: ['AAAAAAAA-0000-4000-8000-00000000000A'],
    });
    await queue.activate(ADA);

    const result = await queue.enqueue({ ...reading, name: ' Reading ' });

    expect(result).toMatchObject({
      ok: true,
      item: { id: 'aaaaaaaa-0000-4000-8000-00000000000a' },
    });
    // `attempted` may already be set by the flush that follows the enqueue.
    expect(storedItems(storage)).toEqual([
      {
        id: 'aaaaaaaa-0000-4000-8000-00000000000a',
        payload: { ...reading, description: null },
        state: 'pending',
        attempted: expect.any(Boolean),
        queuedAt: NOW,
      },
    ]);
  });

  it('shows the pending topic with only what the user gave, and no server fields', async () => {
    const { queue } = launch({ send: offline });
    await queue.activate(ADA);
    await queue.enqueue({ ...reading, description: 'Novels' });

    expect(queue.pendingTopics()).toEqual([
      {
        kind: 'pending',
        id: 'aaaaaaaa-0000-4000-8000-00000000000a',
        ...reading,
        description: 'Novels',
        syncState: 'pending',
      },
    ]);
  });

  it('keeps nothing, and calls no server, when the create cannot be stored', async () => {
    const { send } = server();
    const { queue, storage } = launch({ send });
    await queue.activate(ADA);
    storage.failing.setItem = true;

    const result = await queue.enqueue(reading);

    expect(result).toEqual({ ok: false, reason: 'storage_failed' });
    expect(queue.pendingTopics()).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses fields that can never be created', async () => {
    const { queue } = launch();
    await queue.activate(ADA);
    expect(await queue.enqueue({ ...reading, name: '' })).toEqual({
      ok: false,
      reason: 'invalid_fields',
    });
  });

  it('refuses before a user is active', async () => {
    const { queue } = launch();
    expect(await queue.enqueue(reading)).toEqual({ ok: false, reason: 'not_ready' });
  });
});

describe('after a restart', () => {
  it('still has the pending topic, and sends it once the server is reachable', async () => {
    const storage = memoryStorage();
    const first = launch({ storage, send: offline });
    await first.queue.activate(ADA);
    await first.queue.enqueue(reading);

    const { send, created } = server();
    const next = launch({ storage, send });
    await next.queue.activate(ADA);
    expect(next.queue.pendingTopics().map((t) => t.name)).toEqual(['Reading']);

    await next.queue.flush();

    expect(created.get('aaaaaaaa-0000-4000-8000-00000000000a')).toEqual({
      ...reading,
      description: null,
    });
    expect(next.queue.pendingTopics()).toEqual([]);
    expect(storedItems(storage)).toEqual([]);
  });

  it('keeps each user apart, and sign-out keeps the queue', async () => {
    const storage = memoryStorage();
    const { queue } = launch({ storage, send: offline });
    await queue.activate(ADA);
    await queue.enqueue(reading);
    queue.deactivate();

    await queue.activate(GRACE);
    expect(queue.pendingTopics()).toEqual([]);
    queue.deactivate();

    await queue.activate(ADA);
    expect(queue.pendingTopics().map((t) => t.name)).toEqual(['Reading']);
    expect(storedItems(storage, ADA)).toHaveLength(1);
  });
});

describe('flushing', () => {
  it('confirms a created topic, and only then removes it from the queue', async () => {
    const { send } = server();
    const order: string[] = [];
    const storage = memoryStorage();
    const confirm = jest.fn(async (_userId: string, topic: Topic) => {
      order.push(`confirm ${topic.name}; queued: ${storedItems(storage).length}`);
      return true;
    });
    const { queue } = launch({ storage, send, confirm });
    await queue.activate(ADA);

    await queue.enqueue(reading);
    await queue.flush();

    expect(confirm).toHaveBeenCalledWith(ADA, expect.objectContaining({ name: 'Reading' }));
    expect(order).toEqual(['confirm Reading; queued: 1']);
    expect(storedItems(storage)).toEqual([]);
    expect(queue.isTopicSynced('aaaaaaaa-0000-4000-8000-00000000000a')).toBe(true);
  });

  it('keeps the item when the confirmed topic could not be saved, and replays it later', async () => {
    const { send, created } = server();
    const confirm = jest.fn(async (_userId: string, _topic: Topic) => false);
    const { queue, storage } = launch({ send, confirm });
    await queue.activate(ADA);
    await queue.enqueue(reading);
    await queue.flush();

    expect(storedItems(storage)).toHaveLength(1);
    expect(queue.isTopicSynced('aaaaaaaa-0000-4000-8000-00000000000a')).toBe(false);

    confirm.mockResolvedValue(true);
    await queue.flush();

    expect(send).toHaveBeenCalledTimes(2);
    expect(created.size).toBe(1);
    expect(storedItems(storage)).toEqual([]);
  });

  it('marks the create as attempted in storage before sending it', async () => {
    const storage = memoryStorage();
    let storedWhenSent: unknown;
    const send: Send = async () => {
      storedWhenSent = storedItems(storage)[0];
      throw new NetworkError();
    };
    const { queue } = launch({ storage, send });
    await queue.activate(ADA);

    await queue.enqueue(reading);
    await queue.flush();

    expect(storedWhenSent).toMatchObject({ attempted: true, state: 'pending' });
  });

  it('does not send when the attempt cannot be recorded first', async () => {
    const storage = memoryStorage({
      [topicCreateQueueKey(ADA)]: JSON.stringify({
        version: 1,
        items: [
          {
            id: 'aaaaaaaa-0000-4000-8000-00000000000a',
            payload: { ...reading, description: null },
            state: 'pending',
            attempted: false,
            queuedAt: NOW,
          },
        ],
      }),
    });
    const { send } = server();
    const { queue } = launch({ storage, send });
    await queue.activate(ADA);
    storage.failing.setItem = true;

    await queue.flush();

    expect(send).not.toHaveBeenCalled();
    expect(storedItems(storage)[0]).toMatchObject({ attempted: false });
  });

  it.each([
    ['a network failure', new NetworkError()],
    ['a server error', new HttpError(503, undefined)],
    ['a sign-in that could not be renewed', new UnauthenticatedError()],
  ])('keeps the item pending after %s, with its payload frozen', async (_case, error) => {
    const send = jest.fn<Promise<Topic>, [string, CreateTopicPayload]>().mockRejectedValue(error);
    const { queue, storage } = launch({ send });
    await queue.activate(ADA);
    await queue.enqueue(reading);

    await queue.flush();

    expect(storedItems(storage)).toEqual([
      expect.objectContaining({ state: 'pending', attempted: true }),
    ]);
    expect(await queue.revise('aaaaaaaa-0000-4000-8000-00000000000a', piano)).toEqual({
      ok: false,
      reason: 'not_revisable',
    });
  });

  it('resends exactly the payload of the uncertain attempt', async () => {
    const send = jest
      .fn<Promise<Topic>, [string, CreateTopicPayload]>()
      .mockRejectedValue(new NetworkError());
    const { queue } = launch({ send });
    await queue.activate(ADA);
    await queue.enqueue({ ...reading, description: ' Novels ' });

    await queue.flush();
    await queue.flush();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
    expect(JSON.stringify(send.mock.calls[1]?.[1])).toBe(
      JSON.stringify({ ...reading, description: 'Novels' }),
    );
  });

  it('stops sending once the server cannot be reached', async () => {
    const send = jest.fn(offline);
    const { queue } = launch({ send });
    await queue.activate(ADA);
    await queue.enqueue(reading);
    await queue.enqueue(piano);
    await queue.flush();
    send.mockClear();

    await queue.flush();

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('a name already taken', () => {
  async function taken() {
    const { send, created } = server();
    const sendTaken = jest.fn<Promise<Topic>, [string, CreateTopicPayload]>(async (id, payload) => {
      if (payload.name === 'Reading') throw conflict('topic_name_taken');
      return send(id, payload);
    });
    const app = launch({ send: sendTaken });
    await app.queue.activate(ADA);
    await app.queue.enqueue(reading);
    await app.queue.flush();
    return { ...app, sendTaken, created };
  }

  it('asks for a new name, keeps the topic, and does not retry by itself', async () => {
    const { queue, storage, sendTaken } = await taken();

    expect(storedItems(storage)).toEqual([
      expect.objectContaining({ state: 'needs_name_change', attempted: false }),
    ]);
    expect(queue.pendingTopics()[0]).toMatchObject({
      name: 'Reading',
      syncState: 'needs_name_change',
    });

    await queue.flush();
    expect(sendTaken).toHaveBeenCalledTimes(1);
  });

  it('sends the revised name with the same id, and syncs', async () => {
    const { queue, storage, created } = await taken();

    const revised = await queue.revise('aaaaaaaa-0000-4000-8000-00000000000a', {
      ...reading,
      name: ' Reading 2 ',
    });
    expect(revised).toMatchObject({ ok: true });
    await queue.flush();

    expect(created.get('aaaaaaaa-0000-4000-8000-00000000000a')).toEqual({
      ...reading,
      name: 'Reading 2',
      description: null,
    });
    expect(storedItems(storage)).toEqual([]);
  });

  it('stores the revised payload before it is sent', async () => {
    const { queue, storage } = await taken();
    storage.failing.setItem = true;

    const revised = await queue.revise('aaaaaaaa-0000-4000-8000-00000000000a', piano);

    expect(revised).toEqual({ ok: false, reason: 'storage_failed' });
    expect(queue.pendingTopics()[0]).toMatchObject({ name: 'Reading' });
  });
});

describe('revising before any attempt', () => {
  it('is allowed while the create was never sent, and the new payload is stored', async () => {
    const unsent = {
      id: 'aaaaaaaa-0000-4000-8000-00000000000a',
      payload: { ...reading, description: null },
      state: 'pending',
      attempted: false,
      queuedAt: NOW,
    };
    const storage = memoryStorage({
      [topicCreateQueueKey(ADA)]: JSON.stringify({ version: 1, items: [unsent] }),
    });
    // Activating does not flush by itself; the provider flushes after it.
    const { queue } = launch({ storage, send: offline });
    await queue.activate(ADA);

    const revised = await queue.revise(unsent.id, { ...piano, description: 'Scales' });

    expect(revised).toMatchObject({
      ok: true,
      item: { id: unsent.id, payload: { ...piano, description: 'Scales' }, attempted: false },
    });
    // The flush that follows a revision sends the new payload, with the same id.
    expect(storedItems(storage)[0]).toMatchObject({
      id: unsent.id,
      payload: { ...piano, description: 'Scales' },
    });
  });

  it('is refused for an unknown id', async () => {
    const { queue } = launch();
    await queue.activate(ADA);
    expect(await queue.revise('eeeeeeee-0000-4000-8000-00000000000e', piano)).toEqual({
      ok: false,
      reason: 'not_found',
    });
  });
});

describe('problems that need attention', () => {
  it.each([
    ['an id conflict', conflict('topic_id_conflict')],
    ['another client error', new HttpError(400, { statusCode: 400, message: ['name is bad'] })],
    ['an answer that breaks the contract', new InvalidResponseError()],
  ])('keeps the topic, same id, and stops retrying after %s', async (_case, error) => {
    const send = jest.fn<Promise<Topic>, [string, CreateTopicPayload]>().mockRejectedValue(error);
    const { queue, storage, confirm } = launch({ send });
    await queue.activate(ADA);
    await queue.enqueue(reading);

    await queue.flush();
    await queue.flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(storedItems(storage)).toEqual([
      expect.objectContaining({
        id: 'aaaaaaaa-0000-4000-8000-00000000000a',
        state: 'needs_attention',
      }),
    ]);
    expect(queue.pendingTopics()[0]).toMatchObject({ syncState: 'needs_attention' });
    expect(queue.isTopicSynced('aaaaaaaa-0000-4000-8000-00000000000a')).toBe(false);
  });

  it('does not hold back the topics behind it', async () => {
    const { send } = server();
    const sendWithConflict = jest.fn<Promise<Topic>, [string, CreateTopicPayload]>(
      async (id, payload) => {
        if (payload.name === 'Reading') throw conflict('topic_name_taken');
        return send(id, payload);
      },
    );
    const { queue, storage } = launch({ send: sendWithConflict });
    await queue.activate(ADA);
    await queue.enqueue(reading);
    await queue.enqueue(piano);

    await queue.flush();

    expect(storedItems(storage).map((item) => [item.id, item.state])).toEqual([
      ['aaaaaaaa-0000-4000-8000-00000000000a', 'needs_name_change'],
    ]);
    expect(queue.isTopicSynced('bbbbbbbb-0000-4000-8000-00000000000b')).toBe(true);
  });
});

describe('one flush at a time', () => {
  it('sends each item once when flushes overlap', async () => {
    const { send, calls } = deferredSend();
    const { queue } = launch({ send });
    await queue.activate(ADA);
    await queue.enqueue(reading);

    const first = queue.flush();
    const second = queue.flush();
    await waitUntil(() => calls.length === 1);
    calls[0]?.resolve(makeTopic({ id: calls[0].id, ...reading }));
    await Promise.all([first, second]);

    expect(calls).toHaveLength(1);
  });

  it("never lets one user's answer touch the next user's queue or cache", async () => {
    const storage = memoryStorage();
    const { send, calls } = deferredSend();
    const confirm = jest.fn(async (_userId: string, _topic: Topic) => true);
    const { queue } = launch({ storage, send, confirm });
    await queue.activate(ADA);
    await queue.enqueue(reading);
    const flushing = queue.flush();
    await waitUntil(() => calls.length === 1);

    queue.deactivate();
    await queue.activate(GRACE);
    calls[0]?.resolve(makeTopic({ id: calls[0].id, ...reading }));
    await flushing;

    expect(confirm).not.toHaveBeenCalled();
    expect(queue.getSnapshot()).toMatchObject({ userId: GRACE, items: [] });
    expect(storedItems(storage, GRACE)).toEqual([]);
    // Ada's create is still queued, frozen, and replays on her next flush.
    expect(storedItems(storage, ADA)).toEqual([
      expect.objectContaining({ state: 'pending', attempted: true }),
    ]);
  });
});

describe('isTopicSynced', () => {
  it('is false while the queue is not known, true for a topic with no queued create', async () => {
    const { queue } = launch({ send: offline });
    expect(queue.isTopicSynced('aaaaaaaa-0000-4000-8000-00000000000a')).toBe(false);
    await queue.activate(ADA);
    expect(queue.isTopicSynced('ffffffff-0000-4000-8000-00000000000f')).toBe(true);
    await queue.enqueue(reading);
    expect(queue.isTopicSynced('aaaaaaaa-0000-4000-8000-00000000000a')).toBe(false);
  });
});

describe('a stored queue it cannot trust', () => {
  const valid = JSON.stringify({
    version: 1,
    items: [
      {
        id: 'aaaaaaaa-0000-4000-8000-00000000000a',
        payload: { ...reading, description: null },
        state: 'pending',
        attempted: false,
        queuedAt: NOW,
      },
    ],
  });

  it.each([
    ['malformed JSON', valid.slice(0, -2), 'corrupt_json'],
    ['another version', valid.replace('"version":1', '"version":2'), 'unsupported_version'],
    ['an unknown state', valid.replace('"pending"', '"sent"'), 'invalid_state'],
    ['an uppercase id', valid.replace('aaaaaaaa', 'AAAAAAAA'), 'invalid_state'],
    ['a payload that is not canonical', valid.replace('"Reading"', '" Reading"'), 'invalid_state'],
    [
      'the same id twice',
      valid.replace(/\[(.*)\]/, (_m, item: string) => `[${item},${item}]`),
      'invalid_state',
    ],
  ])(
    'keeps a copy of %s aside, shows no pending topic, and does not crash',
    async (_c, raw, code) => {
      const storage = memoryStorage({ [topicCreateQueueKey(ADA)]: raw });
      const { queue, issues } = launch({ storage });

      await queue.activate(ADA);

      expect(queue.pendingTopics()).toEqual([]);
      expect(storage.data.get(`${topicCreateQueueKey(ADA)}/quarantine`)).toBe(raw);
      expect(issues).toEqual([{ code }]);
    },
  );

  it('leaves the entry in place when no copy could be kept, and writes nothing over it', async () => {
    const storage = memoryStorage({ [topicCreateQueueKey(ADA)]: 'not json' });
    storage.failing.setItem = true;
    const { queue } = launch({ storage });

    const snapshot = await queue.activate(ADA);

    expect(snapshot.status).toBe('unavailable');
    expect(storage.data.get(topicCreateQueueKey(ADA))).toBe('not json');
    expect(await queue.enqueue(reading)).toEqual({ ok: false, reason: 'not_ready' });
  });
});

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !condition(); i++) await Promise.resolve();
  if (!condition()) throw new Error('condition never held');
}
