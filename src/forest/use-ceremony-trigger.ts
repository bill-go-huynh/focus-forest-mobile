import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useSession, type HomeResponse } from '../api';
import { sameMonth } from '../celebrations/celebration-store';
import { useCelebrations } from '../celebrations/CelebrationsProvider';
import { useActiveTimer } from '../timer/ActiveTimerProvider';
import { monthKey } from './forest-format';
import { useCeremonyAcknowledgement } from './queries';

/**
 * Starts the month-end planting ceremony from Home (M3.4) when the server's live Home answer
 * says a month's ceremony is pending: only while Home is on screen, never over a running or
 * paused focus session, one ceremony at a time, at most once per launch. Which month is pending
 * is the server's (`pendingCeremony`), never the device's calendar, and never a saved Home. A
 * ceremony already shown here whose "seen" did not reach the server is not played again: its
 * mark is sent again instead.
 */
export function useCeremonyTrigger(live: HomeResponse | null, focused: boolean): void {
  const router = useRouter();
  const { user } = useSession();
  const celebrations = useCelebrations();
  const timer = useActiveTimer();
  const { retry } = useCeremonyAcknowledgement();
  const opened = useRef(new Set<string>());
  const retried = useRef(new Set<string>());

  // Marks that did not reach the server are sent again, once per launch each, and not in the
  // launch that showed the ceremony (that one already tried): quietly, never by replaying it.
  useEffect(() => {
    if (!focused || celebrations.status !== 'ready' || !user) return;
    for (const month of celebrations.ceremoniesShown) {
      const key = `${user.id}:${monthKey(month)}`;
      if (retried.current.has(key) || opened.current.has(key)) continue;
      retried.current.add(key);
      void retry(month);
    }
  }, [focused, celebrations, user, retry]);

  const pending = live?.pendingCeremony ?? null;
  const focusing = timer.timer !== null && !timer.timer.finished;
  useEffect(() => {
    if (!focused || !pending || !user || focusing) return;
    if (celebrations.status !== 'ready' || timer.status !== 'ready') return;
    if (celebrations.ceremoniesShown.some((month) => sameMonth(month, pending))) return;
    const key = `${user.id}:${monthKey(pending)}`;
    if (opened.current.has(key)) return;
    opened.current.add(key);
    router.push({
      pathname: '/ceremony/[year]/[month]',
      params: { year: String(pending.year), month: String(pending.month) },
    });
  }, [focused, pending, user, focusing, celebrations, timer.status, router]);
}
