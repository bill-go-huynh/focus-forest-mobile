import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Text, View } from 'react-native';

import { useReducedMotion } from '../accessibility';
import type { MonthRef } from '../api';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useHome } from '../core-loop/queries';
import { useTheme } from '../theme';
import { toTreeVisualState, TreeScene } from '../tree';
import { monthName, monthTitle, nextMonth } from './forest-format';
import { useCeremonyAcknowledgement, useRecap } from './queries';

type Step = 'final' | 'planting' | 'seed';

/**
 * The month-end planting ceremony (docs/04 §5 → Month end; M3.4), the first open of a new month:
 * the last month's final tree (as archived, at rest), then it settles into the forest (~3 s;
 * under reduced motion the step is a direct change), then this month's new seed, then the recap
 * on offer. Skippable at every step. The ceremony is acknowledged (PUT …/ceremony-seen, after it
 * is stored as shown) only once the user accepted it: on reaching the new seed, or on Skip;
 * leaving or a kill before that marks nothing, so it plays again.
 */
export function CeremonyScreen({ month }: { month: MonthRef }) {
  const theme = useTheme();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const recap = useRecap(month);
  const { home } = useHome();
  const { acknowledge } = useCeremonyAcknowledgement();
  const [step, setStep] = useState<Step>('final');
  const acknowledged = useRef(false);

  const accept = () => {
    if (acknowledged.current) return;
    acknowledged.current = true;
    void acknowledge(month);
  };

  // The new seed is the ceremony's end: it was presented, so it is acknowledged.
  useEffect(() => {
    if (step === 'seed') accept();
  });

  // Full motion: the tree settles, then the seed appears. Earned state never waits on it.
  useEffect(() => {
    if (step !== 'planting') return;
    const timer = setTimeout(() => setStep('seed'), theme.motion.growth + theme.motion.reward);
    return () => clearTimeout(timer);
  }, [step, theme.motion]);

  const finalTree = useMemo(
    () => (recap.data ? toTreeVisualState(recap.data.tree) : null),
    [recap.data],
  );
  const homeTree = home?.tree ?? null;
  const seed = useMemo(() => (homeTree ? toTreeVisualState(homeTree) : null), [homeTree]);
  const newMonth = homeTree ?? nextMonth(month);
  const body = [theme.type.body, { color: theme.colors.text.primary }];

  const skip = () => {
    accept();
    router.back();
  };

  if (!finalTree) {
    return (
      <Screen title={monthTitle(month)}>
        {recap.isError ? (
          <ErrorState
            illustration="clearing"
            message="Your month's tree isn't available right now."
            onRetry={() => void recap.refetch()}
          />
        ) : (
          <SkeletonGroup label="Loading your month's tree">
            <Skeleton variant="block" />
          </SkeletonGroup>
        )}
        <Button variant="tertiary" label="Skip" onPress={skip} />
      </Screen>
    );
  }

  if (step === 'seed') {
    return (
      <Screen title={monthTitle(month)}>
        {seed ? <TreeScene tree={seed} /> : null}
        <Text style={body}>{`A new seed for ${monthName(newMonth)}.`}</Text>
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          {`Your ${monthName(month)} tree now rests in your forest.`}
        </Text>
        <Button
          variant="primary"
          label="View recap"
          onPress={() =>
            router.replace({
              pathname: '/recap/[year]/[month]',
              params: { year: String(month.year), month: String(month.month) },
            })
          }
        />
        <Button variant="tertiary" label="Not now" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen title={monthTitle(month)}>
      {step === 'planting' ? (
        <Settling>
          <TreeScene tree={finalTree} motion="still" />
        </Settling>
      ) : (
        <TreeScene tree={finalTree} />
      )}
      <Text style={body}>{`Your ${monthName(month)} tree is ready to be planted.`}</Text>
      {step === 'final' ? (
        <Button
          variant="primary"
          label="Plant in your forest"
          onPress={() => setStep(reducedMotion ? 'seed' : 'planting')}
        />
      ) : null}
      <Button variant="tertiary" label="Skip" onPress={skip} />
    </Screen>
  );
}

/** The tree easing back into its place: a slow settle and fade (full motion only). */
function Settling({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: theme.motion.growth,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, theme.motion.growth]);
  return (
    <Animated.View
      testID="ceremony-planting"
      style={{
        opacity: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, theme.opacity.muted],
        }),
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }],
      }}
    >
      <View>{children}</View>
    </Animated.View>
  );
}
