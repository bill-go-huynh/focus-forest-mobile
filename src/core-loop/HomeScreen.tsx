import { useIsFocused, useRouter } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { InlineStatus } from '../components/InlineStatus';
import { ProgressRing } from '../components/ProgressRing';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { StartFocus } from '../focus/StartFocus';
import { useTheme } from '../theme';
import { toTreeVisualState, TreeScene, type TreeSceneHandle } from '../tree';
import type { HomeResponse } from '../api';
import { MomentCaption } from './MomentCaption';
import { dailyGoalLine, streakLine, weekLine, weeklyGoalLine } from './presentation';
import { useHome } from './queries';
import { useCelebrationPresenter } from './use-celebration';
import { useSceneTimeOfDay } from './use-scene-time';

/**
 * Home, Phase 3 Core Loop (docs/05 §3, docs/01 §4): the current month's tree is the hero, Start
 * Focus sits right under it, and today's goal, the streak or rest day, and this week follow as
 * calm lines, not a grid of cards. Everything comes from GET /me/home, or the last saved answer
 * offline. Server-confirmed growth that no screen showed yet plays here, once.
 */
export function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const focused = useIsFocused();
  const { home, fromDevice, query, restoring } = useHome();
  const timeOfDay = useSceneTimeOfDay();
  const sceneRef = useRef<TreeSceneHandle>(null);
  const homeTree = home?.tree ?? null;
  const tree = useMemo(() => (homeTree ? toTreeVisualState(homeTree) : null), [homeTree]);
  const moment = useCelebrationPresenter({
    ready: focused,
    tree,
    scene: sceneRef,
    // Every waiting growth that no other screen (an open Completion) is showing.
    select: (pending, held) => pending.filter((intent) => !held.includes(intent.sessionId)),
  });

  return (
    <Screen title="This month">
      <View
        testID="home-hero"
        style={{ minHeight: height * 0.45, justifyContent: 'center', gap: theme.space[3] }}
      >
        {tree ? (
          <TreeScene ref={sceneRef} tree={tree} timeOfDay={timeOfDay} active={focused} />
        ) : query.isPending || restoring ? (
          <SkeletonGroup label="Loading your tree">
            <Skeleton variant="block" />
          </SkeletonGroup>
        ) : (
          <ErrorState
            illustration="seed-in-soil"
            message="We couldn't load your tree right now."
            reassurance="Your focus sessions are safe on this device."
            onRetry={() => void query.refetch()}
          />
        )}
        {moment ? <MomentCaption moment={moment} /> : null}
      </View>

      {fromDevice && query.isError ? (
        <InlineStatus tone="info" message="Showing your tree as last saved on this device." />
      ) : null}

      <StartFocus quickTopics={home?.recentTopics ?? []} />

      {home ? <HomeProgress home={home} /> : null}

      {tree ? (
        <Button variant="tertiary" label="Tree details" onPress={() => router.push('/tree')} />
      ) : null}
    </Screen>
  );
}

/** Today's goal, the streak or rest day, this week, and the weekly goal when there is one. */
function HomeProgress({ home }: { home: HomeResponse }) {
  const theme = useTheme();
  const daily = dailyGoalLine(home.goals.daily.today);
  const weekly = weeklyGoalLine(home.goals.weekly.thisWeek);
  const line = [theme.type.body, { color: theme.colors.text.primary }];
  return (
    <View style={{ gap: theme.space[3] }}>
      <ProgressRing progress={daily.percent} label="Daily goal" valueText={daily.valueText} />
      <Text style={line}>{streakLine(home)}</Text>
      <Text style={line}>{weekLine(home.week)}</Text>
      {weekly ? (
        <ProgressRing
          progress={weekly.percent}
          label="Weekly goal"
          valueText={weekly.valueText}
          tone="accent"
        />
      ) : null}
    </View>
  );
}
