import type { ApiClient } from './client';

/**
 * M7.1: the signed-in person's own data (focus-forest-api A7.1). The export is passed on as the
 * server wrote it: the app only hands it to the person, never reads it.
 */
export function exportMyData(client: ApiClient): Promise<unknown> {
  return client.request('/me/export');
}

/**
 * Deletes the account and everything it owns, at once. The password confirms it, or (W.2) for an
 * account that signs in only with Google, a fresh Google ID token for the same Google account.
 */
export type DeleteConfirmation = { password: string } | { googleIdToken: string };

export async function deleteAccount(
  client: ApiClient,
  confirmation: DeleteConfirmation,
): Promise<void> {
  await client.request('/me', { method: 'DELETE', body: confirmation });
}
