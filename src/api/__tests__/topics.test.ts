import { fakeFetch, makeSession, memoryTokenStore, nestError, NOW } from '../../test-utils/api';
import { makeTopic } from '../../test-utils/topics';
import { createApi } from '../api';
import { HttpError, InvalidResponseError, NetworkError } from '../errors';
import {
  archiveTopic,
  createTopic,
  listTopics,
  restoreTopic,
  topicErrorCode,
  topicSchema,
  updateTopic,
} from '../topics';

const ID = makeTopic().id;

const TOPIC = makeTopic();

async function setup(handler: Parameters<typeof fakeFetch>[0]) {
  const net = fakeFetch(handler);
  const api = createApi({
    baseUrl: 'https://api.example.com',
    fetch: net.fetch,
    store: memoryTokenStore(makeSession()),
    now: () => NOW,
  });
  await api.session.restore();
  return { ...net, api };
}

const replyWith = (body: unknown) => () => ({ status: 200, body });

describe('topicSchema', () => {
  it('accepts a full topic', () => {
    expect(topicSchema.parse(TOPIC)).toEqual(TOPIC);
  });

  it('accepts the nullable fields as null: unused, no description', () => {
    const plain = { ...TOPIC, description: null, lastUsedAt: null, lastPlannedMinutes: null };
    expect(topicSchema.parse(plain)).toEqual(plain);
  });

  it('accepts an archived topic with its archive time', () => {
    const archived = { ...TOPIC, status: 'archived', archivedAt: '2026-09-27T11:00:00.000Z' };
    expect(topicSchema.parse(archived)).toEqual(archived);
  });

  it('drops fields the contract does not have, like every API schema here', () => {
    expect(topicSchema.parse({ ...TOPIC, extra: 1 })).toEqual(TOPIC);
  });

  it.each([
    ['an id that is not a UUID', { id: 'topic-1' }],
    ['an uppercase id (the API sends lowercase)', { id: ID.toUpperCase() }],
    ['an unknown status', { status: 'deleted' }],
    ['a color outside the palette', { color: 'topic.13' }],
    ['a raw color', { color: '#00ff00' }],
    ['an empty name', { name: '' }],
    ['a malformed creation time', { createdAt: 'yesterday' }],
    ['a malformed last use', { lastUsedAt: '2026-09-27' }],
    ['fractional planned minutes', { lastPlannedMinutes: 25.5 }],
    ['zero planned minutes', { lastPlannedMinutes: 0 }],
    ['planned minutes as text', { lastPlannedMinutes: '25' }],
    ['a missing field', { lastPlannedMinutes: undefined }],
    ['an archived topic without its archive time', { status: 'archived' }],
    ['an active topic with an archive time', { archivedAt: '2026-09-27T11:00:00.000Z' }],
  ])('rejects %s', (_case, change) => {
    expect(topicSchema.safeParse({ ...TOPIC, ...change }).success).toBe(false);
  });
});

describe('listTopics (GET /me/topics)', () => {
  it('lists every topic in creation order without parameters', async () => {
    const { api, requests } = await setup(replyWith([TOPIC]));

    await expect(listTopics(api.client)).resolves.toEqual([TOPIC]);

    expect(requests[0]).toMatchObject({
      url: 'https://api.example.com/me/topics',
      method: 'GET',
      headers: { Authorization: 'Bearer access-token-1' },
    });
  });

  it('asks for the recent active topics exactly as the picker needs them', async () => {
    const { api, requests } = await setup(replyWith([]));
    await listTopics(api.client, { status: 'active', sort: 'recent' });
    expect(requests[0]?.url).toBe('https://api.example.com/me/topics?status=active&sort=recent');
  });

  it('asks for archived topics', async () => {
    const { api, requests } = await setup(replyWith([]));
    await listTopics(api.client, { status: 'archived' });
    expect(requests[0]?.url).toBe('https://api.example.com/me/topics?status=archived');
  });

  it.each([
    ['one malformed topic', [TOPIC, { ...TOPIC, color: 'green' }]],
    ['an object instead of a list', { items: [TOPIC] }],
  ])('rejects %s as an invalid response', async (_case, body) => {
    const { api } = await setup(replyWith(body));
    await expect(listTopics(api.client)).rejects.toBeInstanceOf(InvalidResponseError);
  });
});

describe('topic mutations', () => {
  it('creates with the caller’s id and the fields given (PUT /me/topics/:id)', async () => {
    const { api, requests } = await setup(() => ({ status: 201, body: TOPIC }));
    const fields = { name: 'Reading', icon: 'book', color: 'topic.1', description: 'Novels' };

    await expect(createTopic(api.client, ID, fields)).resolves.toEqual(TOPIC);

    expect(requests[0]).toMatchObject({
      url: `https://api.example.com/me/topics/${ID}`,
      method: 'PUT',
      body: fields,
    });
  });

  it('treats a replayed create (200) like a new one', async () => {
    const { api } = await setup(replyWith(TOPIC));
    await expect(
      createTopic(api.client, ID, { name: 'Reading', icon: 'book', color: 'topic.1' }),
    ).resolves.toEqual(TOPIC);
  });

  it('edits only the fields given (PATCH /me/topics/:id)', async () => {
    const { api, requests } = await setup(replyWith({ ...TOPIC, name: 'Books' }));
    await expect(updateTopic(api.client, ID, { name: 'Books' })).resolves.toMatchObject({
      name: 'Books',
      lastUsedAt: TOPIC.lastUsedAt,
      lastPlannedMinutes: 45,
    });
    expect(requests[0]).toMatchObject({
      url: `https://api.example.com/me/topics/${ID}`,
      method: 'PATCH',
      body: { name: 'Books' },
    });
  });

  it.each([
    ['archive', archiveTopic],
    ['restore', restoreTopic],
  ])('%ss (POST /me/topics/:id/%s) without a body', async (action, send) => {
    const { api, requests } = await setup(replyWith(TOPIC));
    await expect(send(api.client, ID)).resolves.toEqual(TOPIC);
    expect(requests[0]).toMatchObject({
      url: `https://api.example.com/me/topics/${ID}/${action}`,
      method: 'POST',
      body: undefined,
    });
  });

  it('rejects a mutation answer that does not match the contract', async () => {
    const { api } = await setup(replyWith({ ...TOPIC, lastPlannedMinutes: undefined }));
    await expect(archiveTopic(api.client, ID)).rejects.toBeInstanceOf(InvalidResponseError);
  });
});

describe('topic errors', () => {
  const conflict = (code: string, message: string) => ({
    ...nestError(409, message),
    code,
  });

  it.each(['topic_name_taken', 'topic_id_conflict'])(
    'keeps the stable code %s on the error',
    async (code) => {
      const { api } = await setup(() => ({ status: 409, body: conflict(code, 'Anything.') }));

      const error = await createTopic(api.client, ID, {
        name: 'Reading',
        icon: 'book',
        color: 'topic.1',
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({ status: 409, code });
      expect(topicErrorCode(error)).toBe(code);
    },
  );

  it('branches on the code, never on the message', async () => {
    const { api } = await setup(() => ({
      status: 409,
      body: conflict('topic_name_taken', 'A different topic was already created with this id.'),
    }));
    const error = await updateTopic(api.client, ID, { name: 'Piano' }).catch((e: unknown) => e);
    expect(topicErrorCode(error)).toBe('topic_name_taken');
  });

  it.each([
    ['a 409 without a code', new HttpError(409, nestError(409, 'topic_name_taken'))],
    ['an unknown code', new HttpError(409, { ...nestError(409, 'x'), code: 'something_new' })],
    ['a not found', new HttpError(404, nestError(404, 'Topic not found.'))],
    ['a network failure', new NetworkError()],
    ['anything else', new Error('topic_name_taken')],
  ])('has no topic code for %s', (_case, error) => {
    expect(topicErrorCode(error)).toBeNull();
  });

  it('leaves an unknown topic (404) as an HTTP status to branch on', async () => {
    const { api } = await setup(() => ({ status: 404, body: nestError(404, 'Topic not found.') }));
    await expect(restoreTopic(api.client, ID)).rejects.toMatchObject({ status: 404, code: null });
  });
});
