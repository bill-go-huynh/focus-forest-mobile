import { useRouter, usePathname } from 'expo-router';
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { useSession } from '../api';
import { useActiveTimerStore } from '../timer/ActiveTimerProvider';
import type { CompletionIntents } from './completion-intents';

const IntentsContext = createContext<CompletionIntents | null>(null);

/**
 * Collects which Session Completion to open: a session this launch saw running that has been
 * handed off, and a tapped timer notification (`listenForTaps`). Place it inside
 * `ActiveTimerProvider`; `CompletionNavigator` opens them.
 */
export function CompletionIntentsProvider({
  intents,
  listenForTaps,
  children,
}: {
  intents: CompletionIntents;
  listenForTaps?: (listener: (tap: { userId: string; sessionId: string }) => void) => () => void;
  children: ReactNode;
}) {
  const timers = useActiveTimerStore();

  useEffect(() => intents.watch(timers), [intents, timers]);

  useEffect(
    () => listenForTaps?.((tap) => intents.request({ ...tap, source: 'tap' })),
    [intents, listenForTaps],
  );

  return <IntentsContext.Provider value={intents}>{children}</IntentsContext.Provider>;
}

export function useCompletionIntents(): CompletionIntents {
  const intents = useContext(IntentsContext);
  if (!intents)
    throw new Error('useCompletionIntents must be used inside CompletionIntentsProvider.');
  return intents;
}

/**
 * Opens a Session Completion once, for the signed-in user only. A session that ended while the
 * app was open appears where the user is focusing: from Focus (replacing it, so Done returns
 * Home) or Home; elsewhere it waits until they are back on Home, instead of taking the screen
 * away mid-task. A tapped notification opens it from anywhere: the user asked for it. A request
 * for another user is dropped, never shown.
 */
export function CompletionNavigator() {
  const intents = useCompletionIntents();
  const { pending } = useSyncExternalStore(intents.subscribe, intents.getSnapshot);
  const { status, user } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pending || status !== 'authenticated' || !user) return;
    if (pending.userId !== user.id) {
      intents.drop(pending.sessionId);
      return;
    }
    const focusing = pathname === '/' || pathname === '/focus';
    if (pending.source !== 'tap' && !focusing) return;
    intents.shown(pending.sessionId);
    const href = {
      pathname: '/completion/[sessionId]',
      params: { sessionId: pending.sessionId },
    } as const;
    if (pathname === '/focus') router.replace(href);
    else router.push(href);
  }, [intents, pending, status, user, pathname, router]);

  return null;
}
