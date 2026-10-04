import { useEffect, useRef, useState } from 'react';

import { announce } from '../accessibility';
import { useSession, type HomeResponse } from '../api';
import { useCelebrations, useCelebrationStore } from '../celebrations/CelebrationsProvider';

export const GOAL_REACHED_TEXT = "You reached today's goal.";

/**
 * Meeting the daily goal, said quietly once (docs/12 Phase 4: "celebrated once"), as one line
 * beside the goal: no animation of its own (a session's blossoms are the tree's reward, shown by
 * the growth moment). `home` must be a live server answer (never a saved one). When the screen
 * can show it and the server says today's goal is completed, and that day was not celebrated,
 * the line is committed to state, then announced, then the day is stored as celebrated (in the
 * celebration store, so Home and Completion share it). True while the line is on screen.
 */
export function useGoalReached(home: HomeResponse | null | undefined, ready: boolean): boolean {
  const { user } = useSession();
  const store = useCelebrationStore();
  const celebrations = useCelebrations();
  const [shown, setShown] = useState<{ userId: string; date: string } | null>(null);
  const played = useRef<string | null>(null);
  const today = home?.goals.daily.today;

  const due =
    ready &&
    user !== null &&
    celebrations.status === 'ready' &&
    today?.completed === true &&
    !celebrations.goalsCelebrated.includes(today.date);
  if (due && user && today && (shown?.date !== today.date || shown.userId !== user.id)) {
    setShown({ userId: user.id, date: today.date });
  }

  useEffect(() => {
    if (!shown) return;
    const key = `${shown.userId}:${shown.date}`;
    if (played.current === key) return;
    played.current = key;
    announce(GOAL_REACHED_TEXT);
    void store.celebrateGoal(shown.userId, shown.date);
  }, [shown, store]);

  return shown !== null && shown.userId === user?.id && shown.date === today?.date;
}
