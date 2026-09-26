import { fakeFetch, makeSession, memoryTokenStore, nestError, NOW } from '../../test-utils/api';
import { makePreferences } from '../../test-utils/preferences';
import { createApi } from '../api';
import { InvalidResponseError } from '../errors';
import { getPreferences, updatePreferences } from '../preferences';

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

describe('preferences API (A5: GET and PATCH /me/preferences)', () => {
  it('reads the preferences with the access token', async () => {
    const { api, requests } = await setup(() => ({ status: 200, body: makePreferences() }));
    await expect(getPreferences(api.client)).resolves.toEqual(makePreferences());
    expect(requests[0]).toMatchObject({
      url: 'https://api.example.com/me/preferences',
      method: 'GET',
      headers: { Authorization: 'Bearer access-token-1' },
    });
  });

  it('sends only the given change', async () => {
    const { api, requests } = await setup(() => ({
      status: 200,
      body: makePreferences({ sound: false }),
    }));
    await updatePreferences(api.client, { sound: false });
    expect(requests[0]).toMatchObject({ method: 'PATCH', body: { sound: false } });
  });

  it('sends a single notification category change', async () => {
    const { api, requests } = await setup(() => ({ status: 200, body: makePreferences() }));
    await updatePreferences(api.client, {
      notifications: { dailyGoalReminder: { enabled: true } },
    });
    expect(requests[0]!.body).toEqual({ notifications: { dailyGoalReminder: { enabled: true } } });
  });

  it.each([
    ['an unknown theme', { theme: 'sepia' }],
    ['a missing category', { notifications: {} }],
  ])('rejects a response with %s', async (_case, override) => {
    const { api } = await setup(() => ({
      status: 200,
      body: { ...makePreferences(), ...override },
    }));
    await expect(getPreferences(api.client)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('passes API errors through', async () => {
    const { api } = await setup(() => ({
      status: 400,
      body: nestError(400, 'sound must be true or false.'),
    }));
    await expect(updatePreferences(api.client, { sound: false })).rejects.toMatchObject({
      status: 400,
    });
  });
});
