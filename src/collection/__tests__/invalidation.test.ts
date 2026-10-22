import { QueryClient } from '@tanstack/react-query';

import { invalidateCoreLoop } from '../../core-loop/query-keys';
import { collectionQueryKey } from '../../progression/query-keys';
import { forestQueryKey, treeDetailsQueryKey } from '../../forest/query-keys';

describe('what a stored session or recovery marks stale (M4.3)', () => {
  it('includes the Collection Book, so a new unlock is read from the server', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(collectionQueryKey, { sections: [] });
    await invalidateCoreLoop(queryClient);
    expect(queryClient.getQueryState(collectionQueryKey)?.isInvalidated).toBe(true);
    queryClient.clear();
  });
});

describe('the current month outside Home after a session (owner, 2026-10-22)', () => {
  it('marks the forest and this month’s details stale, so they show the same tree as Home', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(forestQueryKey, { pages: [] });
    queryClient.setQueryData(treeDetailsQueryKey({ year: 2026, month: 10 }), { kind: 'growing' });
    await invalidateCoreLoop(queryClient);
    expect(queryClient.getQueryState(forestQueryKey)?.isInvalidated).toBe(true);
    expect(
      queryClient.getQueryState(treeDetailsQueryKey({ year: 2026, month: 10 }))?.isInvalidated,
    ).toBe(true);
    queryClient.clear();
  });
});
