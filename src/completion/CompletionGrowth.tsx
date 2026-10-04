import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import type { FocusSession, GrowthResult } from '../api';
import { isCelebratable } from '../celebrations/celebration-store';
import { useCelebrations, useCelebrationStore } from '../celebrations/CelebrationsProvider';
import { ProgressRing } from '../components/ProgressRing';
import { serverConfirmations } from '../core-loop/confirmations';
import { MomentCaption } from '../core-loop/MomentCaption';
import { dailyGoalLine, growthMoment, streakLine } from '../core-loop/presentation';
import { useHome } from '../core-loop/queries';
import { useCelebrationPresenter } from '../core-loop/use-celebration';
import { GOAL_REACHED_TEXT, useGoalReached } from '../core-loop/use-goal-met';
import { useSceneTimeOfDay } from '../core-loop/use-scene-time';
import { useTheme } from '../theme';
import { toTreeVisualState, TreeScene, type TreeSceneHandle } from '../tree';

/**
 * What the session did to the month's tree, on Session Completion (docs/05, docs/04 §5), from
 * the server's GrowthResult only. While this screen is open it owns its session's celebration:
 * a growth that arrives here (a sync while the screen is open) plays in place, once, and is
 * consumed after it shows. Without the server's answer (`session` null) nothing is claimed. A
 * session stored before Phase 3 (`growth: null`) shows no tree; a late session of an archived
 * month says so calmly. The daily goal and streak show once Home was fetched after the sync.
 */
export function CompletionGrowth({
  sessionId,
  session,
}: {
  sessionId: string;
  session: FocusSession | null;
}) {
  const theme = useTheme();
  const store = useCelebrationStore();
  const celebrations = useCelebrations();
  const timeOfDay = useSceneTimeOfDay();
  const sceneRef = useRef<TreeSceneHandle>(null);

  // This screen shows its session's growth: Home leaves it alone meanwhile.
  useEffect(() => {
    store.hold(sessionId);
    return () => store.release(sessionId);
  }, [store, sessionId]);

  const pending = celebrations.pending.find((intent) => intent.sessionId === sessionId);
  const answered: GrowthResult | null | undefined = pending?.growth ?? session?.growth;
  // Kept once seen: a later answer without growth (a note's) never takes the tree away.
  const [seen, setSeen] = useState<GrowthResult | null>(null);
  if (isCelebratable(answered) && answered !== seen) setSeen(answered);
  const growth = isCelebratable(answered) ? answered : seen;
  const tree = useMemo(() => (growth?.tree ? toTreeVisualState(growth.tree) : null), [growth]);

  const moment = useCelebrationPresenter({
    ready: session !== null,
    tree,
    scene: sceneRef,
    select: (all) => all.filter((intent) => intent.sessionId === sessionId),
  });

  if (!session) return null;
  if (session.growth?.monthClosed) {
    const month = new Date(Date.UTC(session.year, session.month - 1, 1)).toLocaleDateString(
      undefined,
      { month: 'long', year: 'numeric', timeZone: 'UTC' },
    );
    return (
      <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
        {`Saved to ${month}. That month's tree is already resting in your forest.`}
      </Text>
    );
  }
  return (
    <View style={{ gap: theme.space[3] }}>
      {tree && growth ? (
        <>
          <TreeScene ref={sceneRef} tree={tree} timeOfDay={timeOfDay} />
          {/* A moment shown before (consumed) is described, not played again. */}
          <MomentCaption moment={moment ?? growthMoment([growth])} />
        </>
      ) : null}
      <CompletionProgress />
    </View>
  );
}

/**
 * The server's daily goal and streak, shown only from a Home asked after the server confirmed
 * this screen's session. It mounts once the session is confirmed, and notes the confirmation
 * count then: never a cached or saved Home, nor one asked before the confirmation that answers
 * later, and never anything computed here.
 */
function CompletionProgress() {
  const theme = useTheme();
  const { query, askedAfter } = useHome();
  const [confirmation] = useState(() => serverConfirmations.current());
  const answer = query.data?.home;
  const home = answer && askedAfter !== null && askedAfter >= confirmation ? answer : null;
  // Today's goal reached is said once, here or on Home, whichever shows it first.
  const reached = useGoalReached(home, true);
  if (!home) return null;
  const daily = dailyGoalLine(home.goals.daily.today);
  return (
    <View testID="completion-progress" style={{ gap: theme.space[2] }}>
      <ProgressRing progress={daily.percent} label="Daily goal" valueText={daily.valueText} />
      {reached ? (
        <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>
          {GOAL_REACHED_TEXT}
        </Text>
      ) : null}
      <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>
        {streakLine(home)}
      </Text>
    </View>
  );
}
