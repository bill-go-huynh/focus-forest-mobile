import { QueryClient } from '@tanstack/react-query';

import { invalidateCoreLoop } from '../../core-loop/query-keys';
import { collectionQueryKey } from '../../progression/query-keys';

describe('what a stored session or recovery marks stale (M4.3)', () => {
  it('includes the Collection Book, so a new unlock is read from the server', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(collectionQueryKey, { sections: [] });
    await invalidateCoreLoop(queryClient);
    expect(queryClient.getQueryState(collectionQueryKey)?.isInvalidated).toBe(true);
    queryClient.clear();
  });
});
