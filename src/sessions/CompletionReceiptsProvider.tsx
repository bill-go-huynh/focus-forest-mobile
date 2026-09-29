import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { useSession } from '../api';
import type { CompletionReceipts, CompletionReceiptsSnapshot } from './completion-receipts';

const ReceiptsContext = createContext<CompletionReceipts | null>(null);

/**
 * Reads the signed-in user's completion receipts; sign-out forgets them in memory, storage
 * keeps them. Launch never waits for it. Place it outside `SessionOutboxProvider`, whose
 * outbox keeps a receipt before a synced session leaves it.
 */
export function CompletionReceiptsProvider({
  receipts,
  children,
}: {
  receipts: CompletionReceipts;
  children: ReactNode;
}) {
  const { status, user } = useSession();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;

  useEffect(() => {
    if (userId) void receipts.activate(userId);
    else receipts.deactivate();
  }, [receipts, userId]);

  return <ReceiptsContext.Provider value={receipts}>{children}</ReceiptsContext.Provider>;
}

/** The server's answers the device kept for the user's recent sessions. */
export function useCompletionReceiptsSnapshot(): CompletionReceiptsSnapshot {
  const receipts = useContext(ReceiptsContext);
  if (!receipts) {
    throw new Error(
      'useCompletionReceiptsSnapshot must be used inside CompletionReceiptsProvider.',
    );
  }
  return useSyncExternalStore(receipts.subscribe, receipts.getSnapshot);
}
