import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { announce } from '../accessibility';
import { useSession } from '../api';
import { useCelebrations, useCelebrationStore } from '../celebrations/CelebrationsProvider';
import type { CelebrationIntent } from '../celebrations/celebration-store';
import {
  TREE_STAGES,
  type TreeReaction,
  type TreeSceneHandle,
  type TreeVisualState,
} from '../tree';
import { unlockMoment, type UnlockMoment } from '../progression/unlocks';
import { motion } from '../theme/tokens';
import { growthMoment, type GrowthMoment } from './presentation';
import { useHaptic } from '../haptics/haptics';

interface Shown {
  userId: string;
  sessionIds: string[];
  moment: GrowthMoment | null;
  unlock: UnlockMoment | null;
}

/**
 * What a screen shows for waiting intents: the tree's moment (null when no session had one),
 * then what they unlocked (M4.1). `revealed` turns true once the tree has reacted, so the badge
 * always comes after the tree (docs/04 → Badge unlock).
 */
export interface Presented {
  moment: GrowthMoment | null;
  unlock: UnlockMoment | null;
  revealed: boolean;
}

/**
 * How long an unlock stays the screen's only moment before another (Home's month ceremony) may
 * follow: a reading pause, not an animation, so it holds under reduced motion too.
 */
export const UNLOCK_READING_MS = motion.reward;

/** The scene reaction for a moment: a stage cross-fade from the server's earlier stage. */
export function reactionFor(moment: GrowthMoment, tree: TreeVisualState): TreeReaction {
  if (moment.reaction === 'stage') {
    const from = TREE_STAGES.find((stage) => stage === moment.fromStage);
    return from ? { kind: 'stage', from: { ...tree, stage: from } } : { kind: 'growth' };
  }
  return { kind: moment.reaction };
}

/**
 * Presents server-confirmed growth and unlocks exactly once (M3.2, M4.1). `select` picks which
 * waiting intents this screen owns (Completion: its own session; Home: every one no screen
 * holds). When the screen can show them, what it shows is committed to state first; only after
 * that render does the scene react, the caption get announced, and the intents get consumed
 * (stored). Several intents become one tree moment and one unlock, the others said in words.
 * The unlock is revealed once the tree's reaction has played (at once without a tree moment),
 * and announced then (its caption, then its line). `onSettled` hears it once all of that, plus the unlock's reading pause,
 * is over (X3: Home's month ceremony follows it instead of waiting for a relaunch).
 */
export function useCelebrationPresenter({
  ready,
  tree,
  scene,
  select,
  onSettled,
}: {
  ready: boolean;
  tree: TreeVisualState | null;
  scene: RefObject<TreeSceneHandle | null>;
  select: (pending: CelebrationIntent[], held: string[]) => CelebrationIntent[];
  onSettled?: (presented: Presented) => void;
}): Presented | null {
  const { user } = useSession();
  const store = useCelebrationStore();
  const celebrations = useCelebrations();
  const haptic = useHaptic();
  const [shown, setShown] = useState<Shown | null>(null);
  const [revealAt, setRevealAt] = useState<{ key: string; at: number } | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const played = useRef<string | null>(null);
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  });

  const waiting =
    celebrations.status === 'ready' ? select(celebrations.pending, celebrations.held) : [];

  // Committed while rendering (guarded, so it settles in one extra render): what is on screen
  // stays until its intents are stored as consumed, and is never shown twice. A tree moment
  // waits for the tree to be on screen; an unlock alone does not need it.
  const onScreen = shown !== null && waiting.some((i) => shown.sessionIds.includes(i.sessionId));
  if (ready && user && waiting.length > 0 && !onScreen) {
    const growths = waiting.flatMap((intent) => (intent.growth ? [intent.growth] : []));
    if (growths.length === 0 || tree) {
      setShown({
        userId: user.id,
        sessionIds: waiting.map((intent) => intent.sessionId),
        moment: growths.length > 0 ? growthMoment(growths) : null,
        unlock: unlockMoment(waiting.map((intent) => intent.progression)),
      });
    }
  }

  const key = shown?.sessionIds.join(',') ?? null;
  const presented = useMemo<Presented | null>(
    () =>
      shown ? { moment: shown.moment, unlock: shown.unlock, revealed: revealedKey === key } : null,
    [shown, revealedKey, key],
  );

  useEffect(() => {
    if (!shown || !key || (shown.moment && !tree)) return;
    if (played.current === key) return;
    played.current = key;
    const duration =
      shown.moment && tree ? (scene.current?.react(reactionFor(shown.moment, tree)) ?? 0) : 0;
    if (shown.moment) announce(shown.moment.caption);
    // A new stage or trait is a milestone (docs/04 §9); plain growth and blossoms stay still.
    if (shown.moment?.kind === 'stage' || shown.moment?.kind === 'trait') haptic('milestone');
    void store.consume(shown.userId, shown.sessionIds);
    setRevealAt({ key, at: Date.now() + duration });
  }, [shown, key, tree, scene, store, haptic]);

  // The unlock comes once the tree's reaction is over. Kept apart from playing, so a re-render
  // meanwhile (a new Home answer) reschedules it instead of losing it.
  const unlock = shown?.unlock ?? null;
  useEffect(() => {
    if (!revealAt || revealAt.key !== key || revealedKey === key) return;
    const timer = setTimeout(
      () => {
        setRevealedKey(revealAt.key);
        if (unlock) {
          haptic('milestone');
          announce(unlock.caption);
          if (unlock.line) announce(unlock.line);
        }
      },
      Math.max(0, revealAt.at - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [revealAt, key, revealedKey, unlock, haptic]);

  // Once revealed (and read), the next sequence may follow: one at a time, never stacked.
  useEffect(() => {
    if (!presented?.revealed) return;
    const timer = setTimeout(
      () => settled.current?.(presented),
      presented.unlock ? UNLOCK_READING_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [presented]);

  return presented;
}
