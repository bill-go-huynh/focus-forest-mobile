import { QueryClient } from '@tanstack/react-query';

import { HttpError, NetworkError } from './errors';

const MAX_RETRIES = 2;

/**
 * Retry only what may succeed on its own: network failures and server errors (5xx).
 * Never retry auth, client errors, or unexpected responses.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (error instanceof NetworkError) return true;
  return error instanceof HttpError && error.status >= 500;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry },
      // A mutation may not be safe to repeat; callers opt in where it is idempotent.
      mutations: { retry: false },
    },
  });
}
