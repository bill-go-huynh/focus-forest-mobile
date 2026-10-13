import type { ApiClient } from './client';

/**
 * M6.1: this device and the focus lease (focus-forest-api A6.1). The answers are not read: the
 * app needs only to know the call went through.
 */

/** `PUT /me/devices/:token`: registers this device's Expo push token for the signed-in user. */
export async function registerDevice(
  client: ApiClient,
  token: string,
  device: { platform: 'ios' | 'android'; appVersion: string | null },
): Promise<void> {
  await client.request(`/me/devices/${encodeURIComponent(token)}`, {
    method: 'PUT',
    body: device.appVersion
      ? { platform: device.platform, appVersion: device.appVersion }
      : { platform: device.platform },
  });
}

/** `DELETE /me/devices/:token`: before sign-out, so the device stops receiving this account's. */
export async function unregisterDevice(client: ApiClient, token: string): Promise<void> {
  await client.request(`/me/devices/${encodeURIComponent(token)}`, { method: 'DELETE' });
}

/** `PUT /me/focus/active`: no notification arrives before `endsAt` (plus the server's grace). */
export async function setFocusLease(client: ApiClient, endsAt: string): Promise<void> {
  await client.request('/me/focus/active', { method: 'PUT', body: { endsAt } });
}

/** `DELETE /me/focus/active`: focus is over; what it held back may arrive now. */
export async function clearFocusLease(client: ApiClient): Promise<void> {
  await client.request('/me/focus/active', { method: 'DELETE' });
}
