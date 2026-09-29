import { fakeFetch, makeSession, memoryTokenStore, NOW } from '../../test-utils/api';
import { createApi } from '../api';
import { InvalidResponseError, NetworkError } from '../errors';
import { getSessionRules, sessionRulesSchema } from '../session-rules';

const RULES = { version: 3, minValidMinutes: 5, maxPauseMinutes: 30 };

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

describe('sessionRulesSchema (GET /session-rules)', () => {
  it('accepts the rules with their configuration version', () => {
    expect(sessionRulesSchema.parse(RULES)).toEqual(RULES);
  });

  it('accepts any whole number the configuration allows (at least 1)', () => {
    const rules = { version: 1, minValidMinutes: 1, maxPauseMinutes: 240 };
    expect(sessionRulesSchema.parse(rules)).toEqual(rules);
  });

  it.each([
    ['a fractional minimum', { minValidMinutes: 5.5 }],
    ['a zero minimum', { minValidMinutes: 0 }],
    ['a zero pause limit', { maxPauseMinutes: 0 }],
    ['minutes as text', { minValidMinutes: '5' }],
    ['a missing pause limit', { maxPauseMinutes: undefined }],
    ['a fractional version', { version: 1.5 }],
    ['a zero version', { version: 0 }],
  ])('rejects %s', (_case, change) => {
    expect(sessionRulesSchema.safeParse({ ...RULES, ...change }).success).toBe(false);
  });
});

describe('getSessionRules', () => {
  it('reads GET /session-rules with the session', async () => {
    const { api, requests } = await setup(() => ({ status: 200, body: RULES }));

    await expect(getSessionRules(api.client)).resolves.toEqual(RULES);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: 'https://api.example.com/session-rules',
      method: 'GET',
    });
    expect(requests[0]?.headers.Authorization).toMatch(/^Bearer /);
  });

  it('refuses a malformed answer instead of guessing rules', async () => {
    const { api } = await setup(() => ({ status: 200, body: { minValidMinutes: 5 } }));
    await expect(getSessionRules(api.client)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('passes a network failure on', async () => {
    const { api } = await setup(() => new NetworkError());
    await expect(getSessionRules(api.client)).rejects.toBeInstanceOf(NetworkError);
  });
});
