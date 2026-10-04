import { QueryClient } from '@tanstack/react-query';

import type { ApiClient } from '../../api';
import { HttpError, NetworkError } from '../../api/errors';
import { profileQueryKey } from '../../profile';
import { createTimeZoneRepair } from '../app-session-outbox';

const ADA = '11111111-1111-4111-8111-111111111111';
const GRACE = '22222222-2222-4222-8222-222222222222';

const profile = (timezone: string | null) => ({
  id: ADA,
  displayName: 'Ada',
  avatarUrl: null,
  bio: null,
  joinDate: '2026-09-01T00:00:00.000Z',
  timezone,
});

function setup({
  zone = 'Asia/Ho_Chi_Minh' as string | null,
  user = ADA as string | null,
  answer = async (body: { timezone: string }) => profile(body.timezone) as unknown,
} = {}) {
  const request = jest.fn(async (_path: string, options: { body?: unknown } = {}) =>
    answer(options.body as { timezone: string }),
  );
  const client = { request } as unknown as ApiClient;
  const queryClient = new QueryClient();
  const currentUser = { id: user };
  const repair = createTimeZoneRepair({
    client,
    queryClient,
    currentUserId: () => currentUser.id,
    deviceTimeZone: () => zone,
  });
  return { repair, request, queryClient, currentUser };
}

describe('createTimeZoneRepair', () => {
  it('sends the device time zone to the profile once and keeps the answer', async () => {
    const { repair, request, queryClient } = setup();
    await expect(repair(ADA)).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      '/me/profile',
      expect.objectContaining({ method: 'PATCH', body: { timezone: 'Asia/Ho_Chi_Minh' } }),
    );
    expect(queryClient.getQueryData(profileQueryKey)).toEqual(profile('Asia/Ho_Chi_Minh'));
  });

  it('sends nothing when the device has no valid time zone', async () => {
    const { repair, request } = setup({ zone: null });
    await expect(repair(ADA)).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['offline', () => new NetworkError()],
    ['a refused zone', () => new HttpError(400, { statusCode: 400, message: 'Bad zone.' })],
    ['a server error', () => new HttpError(503, { statusCode: 503, message: 'Down.' })],
  ])('answers false when the PATCH fails (%s)', async (_case, error) => {
    const { repair } = setup({
      answer: async () => {
        throw error();
      },
    });
    await expect(repair(ADA)).resolves.toBe(false);
  });

  it('answers false when the saved profile still has another time zone', async () => {
    const { repair } = setup({ answer: async () => profile(null) });
    await expect(repair(ADA)).resolves.toBe(false);
  });

  it('never patches another user’s profile', async () => {
    const { repair, request } = setup({ user: GRACE });
    await expect(repair(ADA)).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('does not keep an answer that arrives after the user changed', async () => {
    const { repair, queryClient, currentUser } = setup({
      answer: async (body) => {
        currentUser.id = GRACE;
        return profile(body.timezone);
      },
    });
    await expect(repair(ADA)).resolves.toBe(false);
    expect(queryClient.getQueryData(profileQueryKey)).toBeUndefined();
  });
});
