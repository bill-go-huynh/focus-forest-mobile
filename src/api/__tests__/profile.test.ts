import { fakeFetch, makeSession, memoryTokenStore, nestError, NOW } from '../../test-utils/api';
import { createApi } from '../api';
import { HttpError, InvalidResponseError } from '../errors';
import { getProfile, updateProfile } from '../profile';

const PROFILE = {
  id: 'user-1',
  displayName: 'Mai',
  avatarUrl: null,
  bio: null,
  joinDate: '2026-09-26T10:00:00.000Z',
  timezone: 'Europe/Zurich',
};

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

describe('getProfile (A4: GET /me/profile)', () => {
  it('reads the own profile with the access token', async () => {
    const { api, requests } = await setup(() => ({ status: 200, body: PROFILE }));
    await expect(getProfile(api.client)).resolves.toEqual(PROFILE);
    expect(requests[0]).toMatchObject({
      url: 'https://api.example.com/me/profile',
      method: 'GET',
      headers: { Authorization: 'Bearer access-token-1' },
    });
  });

  it('accepts a profile without a name, bio, or time zone', async () => {
    const empty = { ...PROFILE, displayName: null, bio: null, timezone: null };
    const { api } = await setup(() => ({ status: 200, body: empty }));
    await expect(getProfile(api.client)).resolves.toEqual(empty);
  });
});

describe('updateProfile (A4: PATCH /me/profile)', () => {
  it('sends only the given fields, with the access token', async () => {
    const { api, requests } = await setup(() => ({ status: 200, body: PROFILE }));
    await expect(
      updateProfile(api.client, { displayName: 'Mai', timezone: 'Europe/Zurich' }),
    ).resolves.toEqual(PROFILE);
    expect(requests[0]).toMatchObject({
      url: 'https://api.example.com/me/profile',
      method: 'PATCH',
      body: { displayName: 'Mai', timezone: 'Europe/Zurich' },
      headers: { Authorization: 'Bearer access-token-1' },
    });
  });

  it('rejects a response that does not match the contract', async () => {
    const { api } = await setup(() => ({ status: 200, body: { id: 'user-1' } }));
    await expect(updateProfile(api.client, { displayName: 'Mai' })).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it('passes API errors through', async () => {
    const { api } = await setup(() => ({
      status: 400,
      body: nestError(400, 'displayName cannot be empty.'),
    }));
    await expect(updateProfile(api.client, { displayName: '' })).rejects.toBeInstanceOf(HttpError);
  });
});
