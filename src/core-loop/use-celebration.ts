import { useEffect, useRef, useState, type RefObject } from 'react';

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
import { growthMoment, type GrowthMoment } from './presentation';

interface Shown {
  userId: string;
  sessionIds: string[];
  moment: GrowthMoment;
}

/** The scene reaction for a moment: a stage cross-fade from the server's earlier stage. */
export function reactionFor(moment: GrowthMoment, tree: TreeVisualState): TreeReaction {
  if (moment.reaction === 'stage') {
    const from = TREE_STAGES.find((stage) => stage === moment.fromStage);
    return from ? { kind: 'stage', from: { ...tree, stage: from } } : { kind: 'growth' };
  }
  return { kind: moment.reaction };
}

/**
 * Presents server-confirmed growth exactly once (M3.2). `select` picks which waiting intents
 * this screen owns (Completion: its own session; Home: every one no screen holds). When the
 * screen can show them, the moment is committed to state first; only after that render does the
 * scene react, the caption get announced, and the intents get consumed (stored). Several intents
 * become one moment, the others said in words. `onSettled` hears the moment once its reaction
 * has finished playing (X3: Home's month ceremony follows it instead of waiting for a relaunch).
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
  onSettled?: (moment: GrowthMoment) => void;
}): GrowthMoment | null {
  const { user } = useSession();
  const store = useCelebrationStore();
  const celebrations = useCelebrations();
  const [shown, setShown] = useState<Shown | null>(null);
  const played = useRef<string | null>(null);
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  });

  const waiting =
    celebrations.status === 'ready' ? select(celebrations.pending, celebrations.held) : [];

  // Committed while rendering (guarded, so it settles in one extra render): the moment on
  // screen stays until its intents are stored as consumed, and is never shown twice.
  const onScreen = shown !== null && waiting.some((i) => shown.sessionIds.includes(i.sessionId));
  if (ready && tree && user && waiting.length > 0 && !onScreen) {
    setShown({
      userId: user.id,
      sessionIds: waiting.map((intent) => intent.sessionId),
      moment: growthMoment(waiting.map((intent) => intent.growth)),
    });
  }

  useEffect(() => {
    if (!shown || !tree) return;
    const key = shown.sessionIds.join(',');
    if (played.current === key) return;
    played.current = key;
    const duration = scene.current?.react(reactionFor(shown.moment, tree)) ?? 0;
    announce(shown.moment.caption);
    void store.consume(shown.userId, shown.sessionIds);
    const timer = setTimeout(() => settled.current?.(shown.moment), duration);
    return () => clearTimeout(timer);
  }, [shown, tree, scene, store]);

  return shown?.moment ?? null;
}
