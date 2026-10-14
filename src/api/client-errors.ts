import type { ClientErrorReport } from '../monitoring/error-reporter';
import type { ApiClient } from './client';

/** M7.2: `POST /client-errors` (A7.4), without the session: a report never says who. */
export async function sendClientErrors(
  client: ApiClient,
  errors: readonly ClientErrorReport[],
): Promise<void> {
  await client.request('/client-errors', { method: 'POST', body: { errors }, auth: false });
}
