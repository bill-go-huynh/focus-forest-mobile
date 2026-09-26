import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import type { Api } from './api';
import type { SessionSnapshot } from './session';

const ApiContext = createContext<Api | null>(null);

/**
 * Provides the API (client, auth, session) and the TanStack Query client. When the session
 * ends, every cached query is dropped, so no user data outlives the sign-in.
 */
export function ApiProvider({
  api,
  queryClient,
  children,
}: {
  api: Api;
  queryClient: QueryClient;
  children: ReactNode;
}) {
  useEffect(
    () =>
      api.session.subscribe(() => {
        if (api.session.getSnapshot().status === 'unauthenticated') queryClient.clear();
      }),
    [api, queryClient],
  );
  return (
    <ApiContext.Provider value={api}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiContext.Provider>
  );
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside ApiProvider.');
  return api;
}

/** The session status and user, updated as the session changes. */
export function useSession(): SessionSnapshot {
  const { session } = useApi();
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}
