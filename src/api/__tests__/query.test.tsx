import { useQuery } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { fakeFetch, makeSession, memoryTokenStore, NOW } from '../../test-utils/api';
import { createApi } from '../api';
import { ApiProvider, useApi, useSession } from '../ApiProvider';
import { HttpError, InvalidResponseError, NetworkError, UnauthenticatedError } from '../errors';
import { createQueryClient, shouldRetry } from '../query-client';

describe('query retry policy', () => {
  it.each([
    ['a network error, first retry', 0, new NetworkError('offline'), true],
    ['a network error, second retry', 1, new NetworkError('offline'), true],
    ['a network error, after two retries', 2, new NetworkError('offline'), false],
    ['a server error (5xx)', 0, new HttpError(503, undefined), true],
    ['a client error (4xx)', 0, new HttpError(404, undefined), false],
    ['signed out', 0, new UnauthenticatedError(), false],
    ['an unexpected response', 0, new InvalidResponseError('bad shape'), false],
  ])('for %s: %p', (_case, failures, error, expected) => {
    expect(shouldRetry(failures, error)).toBe(expected);
  });

  it('never retries mutations, which may not be safe to repeat', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});

describe('ApiProvider', () => {
  function setup(stored = makeSession()) {
    const net = fakeFetch(() => ({ status: 200, body: { displayName: 'Mai' } }));
    const api = createApi({
      baseUrl: 'https://api.example.com',
      fetch: net.fetch,
      store: memoryTokenStore(stored),
      now: () => NOW,
    });
    const queryClient = createQueryClient();
    return { api, queryClient, ...net };
  }

  function Status() {
    const { status, user } = useSession();
    return <Text>{`${status} ${user?.email ?? 'nobody'}`}</Text>;
  }

  it('exposes the session status and user, and updates when they change', async () => {
    const { api, queryClient } = setup();
    render(
      <ApiProvider api={api} queryClient={queryClient}>
        <Status />
      </ApiProvider>,
    );
    expect(screen.getByText('unknown nobody')).toBeOnTheScreen();

    await act(() => api.auth.restoreSession());
    expect(screen.getByText('authenticated mai@example.com')).toBeOnTheScreen();

    await act(() => api.auth.signOut());
    expect(screen.getByText('unauthenticated nobody')).toBeOnTheScreen();
  });

  it('gives queries the API client through useApi', async () => {
    const { api, queryClient } = setup();
    await api.auth.restoreSession();
    function Profile() {
      const { client } = useApi();
      const { data } = useQuery({
        queryKey: ['profile'],
        queryFn: () => client.request<{ displayName: string }>('/me/profile'),
      });
      return <Text>{data?.displayName ?? 'loading'}</Text>;
    }
    render(
      <ApiProvider api={api} queryClient={queryClient}>
        <Profile />
      </ApiProvider>,
    );
    expect(await screen.findByText('Mai')).toBeOnTheScreen();
  });

  it('drops every cached query when the session ends, so no user data outlives it', async () => {
    const { api, queryClient } = setup();
    await api.auth.restoreSession();
    queryClient.setQueryData(['profile'], { displayName: 'Mai' });
    render(
      <ApiProvider api={api} queryClient={queryClient}>
        <Status />
      </ApiProvider>,
    );

    await act(() => api.auth.signOut());

    await waitFor(() => expect(queryClient.getQueryData(['profile'])).toBeUndefined());
  });

  it('throws a clear error when used outside the provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Status />)).toThrow(/ApiProvider/);
  });
});
