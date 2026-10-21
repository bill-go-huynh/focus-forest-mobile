import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

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

/**
 * Coming back to the app counts as focus, so what is on screen is read again (owner,
 * 2026-10-21): changes made while away show, and a screen that failed tries again. Only queries
 * on screen and older than their `staleTime` are read. Returns the undo.
 */
export function followAppState(): () => void {
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener('change', (state) =>
      setFocused(state === 'active'),
    );
    return () => subscription.remove();
  });
  return () => focusManager.setEventListener(() => undefined);
}
