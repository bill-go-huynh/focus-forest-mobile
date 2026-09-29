import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { useSession } from '../api';
import { useActiveTimer, useActiveTimerStore } from '../timer/ActiveTimerProvider';
import { useTopicCreateQueueSnapshot } from '../topics/topic-create-sync';
import { handoffFinishedTimer, type HandoffResult } from './session-handoff';
import type { SessionOutbox, SessionOutboxSnapshot } from './session-outbox';

const OutboxContext = createContext<SessionOutbox | null>(null);
const HandoffContext = createContext<(() => Promise<HandoffResult>) | null>(null);

/**
 * Reads the signed-in user's outbox, hands a finished timer to it (at launch, and whenever a
 * timer finishes), and sends it: once the outbox and the topic queue are restored, after each
 * handoff, and whenever the queued topics change (a create was confirmed). Sign-out forgets it
 * in memory; storage keeps it. Launch never waits for it. Place it inside
 * `ActiveTimerProvider` and `TopicCreateQueueProvider`. The handoff runs here, one at a time:
 * a screen that waits for it (`useFinishedTimerHandoff`) shares the run already going.
 */
export function SessionOutboxProvider({
  outbox,
  children,
}: {
  outbox: SessionOutbox;
  children: ReactNode;
}) {
  const { status, user } = useSession();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;
  const timers = useActiveTimerStore();
  const timer = useActiveTimer();
  const topics = useTopicCreateQueueSnapshot();
  const current = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot);

  const outboxReady = userId !== null && current.userId === userId && current.status === 'ready';
  const timerReady = timer.userId === userId && timer.status === 'ready';
  const topicsReady = topics.userId === userId && topics.status === 'ready';
  const finishedId = timer.timer?.finished ? timer.timer.id : null;
  const queuedTopics = topics.items.map((item) => item.id).join(',');

  const running = useRef<Promise<HandoffResult> | null>(null);
  const handoff = useCallback((): Promise<HandoffResult> => {
    if (running.current) return running.current;
    const run = handoffFinishedTimer({ timers, outbox }).then((result) => {
      if (result.ok) void outbox.flush();
      return result;
    });
    running.current = run;
    const done = () => {
      if (running.current === run) running.current = null;
    };
    void run.then(done, done);
    return run;
  }, [outbox, timers]);

  useEffect(() => {
    if (userId) void outbox.activate(userId);
    else outbox.deactivate();
  }, [outbox, userId]);

  useEffect(() => {
    if (!outboxReady || !timerReady || !finishedId) return;
    void handoff();
  }, [handoff, outboxReady, timerReady, finishedId]);

  useEffect(() => {
    if (outboxReady && topicsReady) void outbox.flush();
  }, [outbox, outboxReady, topicsReady, queuedTopics]);

  return (
    <OutboxContext.Provider value={outbox}>
      <HandoffContext.Provider value={handoff}>{children}</HandoffContext.Provider>
    </OutboxContext.Provider>
  );
}

export function useSessionOutbox(): SessionOutbox {
  const outbox = useContext(OutboxContext);
  if (!outbox) throw new Error('useSessionOutbox must be used inside SessionOutboxProvider.');
  return outbox;
}

/** The queued sessions, and the ones this process synced. */
export function useSessionOutboxSnapshot(): SessionOutboxSnapshot {
  const outbox = useSessionOutbox();
  return useSyncExternalStore(outbox.subscribe, outbox.getSnapshot);
}

/**
 * Moves a finished timer's session to the outbox (`handoffFinishedTimer`), then sends it.
 * Calls while one is running share it, so a screen and the provider never hand off twice.
 */
export function useFinishedTimerHandoff(): () => Promise<HandoffResult> {
  const handoff = useContext(HandoffContext);
  if (!handoff) {
    throw new Error('useFinishedTimerHandoff must be used inside SessionOutboxProvider.');
  }
  return handoff;
}
