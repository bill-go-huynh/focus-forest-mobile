import { fakeFetch, makeSession, memoryTokenStore, NOW } from '../../test-utils/api';
import { makeHistoryItem } from '../../test-utils/history';
import { createApi } from '../api';
import { InvalidResponseError } from '../errors';
import { getSessionHistory, HISTORY_PAGE_SIZE, historyPageSchema } from '../history';

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

const ITEM = makeHistoryItem();

describe('getSessionHistory (A2.7: GET /me/sessions)', () => {
  it('asks for the first page with the client page size, and no cursor', async () => {
    const { api, requests } = await setup(() => ({
      status: 200,
      body: { items: [ITEM], nextCursor: 'opaque-1' },
    }));

    const page = await getSessionHistory(api.client, {});

    expect(HISTORY_PAGE_SIZE).toBe(30);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe('https://api.example.com/me/sessions?limit=30');
    expect(page).toEqual({ items: [ITEM], nextCursor: 'opaque-1' });
  });

  it('passes the cursor back exactly as the server gave it, encoded, never decoded', async () => {
    const cursor = 'eyJ2IjoxfQ==+/';
    const { api, requests } = await setup(() => ({
      status: 200,
      body: { items: [], nextCursor: null },
    }));

    const page = await getSessionHistory(api.client, { cursor });

    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe('/me/sessions');
    expect(url.searchParams.get('cursor')).toBe(cursor);
    expect(url.searchParams.get('limit')).toBe('30');
    expect(page.nextCursor).toBeNull();
  });

  it.each([
    ['no items array', { nextCursor: null }],
    ['a missing nextCursor', { items: [] }],
    ['an item without its topic', { items: [{ ...ITEM, topic: undefined }], nextCursor: null }],
    [
      'a topic with an unknown status',
      { items: [{ ...ITEM, topic: { ...ITEM.topic, status: 'deleted' } }], nextCursor: null },
    ],
    [
      'a discarded session that counts',
      { items: [{ ...ITEM, status: 'discarded', counted: true }], nextCursor: null },
    ],
    [
      'a local date with a time',
      { items: [{ ...ITEM, localDate: '2026-09-30T00:00:00Z' }], nextCursor: null },
    ],
  ])('rejects %s', async (_case, body) => {
    const { api } = await setup(() => ({ status: 200, body }));
    await expect(getSessionHistory(api.client, {})).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('accepts every status and an archived topic', () => {
    for (const status of ['completed', 'ended_early', 'discarded'] as const) {
      const item = {
        ...ITEM,
        status,
        counted: status !== 'discarded',
        topic: { ...ITEM.topic, status: 'archived' as const },
      };
      expect(historyPageSchema.parse({ items: [item], nextCursor: null }).items[0]).toEqual(item);
    }
  });
});
