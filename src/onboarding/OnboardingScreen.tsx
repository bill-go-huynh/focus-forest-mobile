import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { useSession } from '../api';
import { Text, View } from 'react-native';

import { Button } from '../components/Button';
import { InlineStatus } from '../components/InlineStatus';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { DailyGoalPicker } from '../consistency/DailyGoalPicker';
import { dailySavedText, formatGoalMinutes, goalErrorText } from '../consistency/goal-format';
import { useGoals, useSetDailyGoal } from '../consistency/queries';
import { useHome } from '../core-loop/queries';
import { useSceneTimeOfDay } from '../core-loop/use-scene-time';
import { StartFocus } from '../focus/StartFocus';
import { useTheme } from '../theme';
import { toTreeVisualState, TreeScene } from '../tree';
import type { OnboardingStep } from './onboarding-store';
import { useOnboarding, useOnboardingStore } from './OnboardingProvider';

/**
 * Onboarding for a new account (docs/02 → Onboarding, docs/05 §3; M3.3), opened once after
 * sign-up. It shows "one month = one tree → forest" with the user's own seed (this month's tree
 * from Home), then a daily goal with the server's suggestion (GET /me/goals), saved only when
 * chosen: Skip creates no goal, and the first goal applies today (the server says so). It ends
 * on the first session (the Phase 2 Start Focus) or Home.
 *
 * Each step reached is stored (`OnboardingStore`), so a kill resumes there. It completes, for
 * good, at "Go to Home", or when the first focus starts here: once its timer is stored and right
 * before Focus opens.
 */
export function OnboardingScreen() {
  const { onboarding } = useOnboarding();
  const store = useOnboardingStore();
  const { user } = useSession();
  const stored = onboarding?.status === 'pending' ? onboarding.step : 'concept';
  const [step, setLocalStep] = useState<OnboardingStep>(stored);
  const [goalStatus, setGoalStatus] = useState<string | null>(null);
  // The stored step arrives once the user's state is read; it never moves the user back.
  const [adopted, setAdopted] = useState(stored);
  if (stored !== adopted) {
    setAdopted(stored);
    if (ORDER.indexOf(stored) > ORDER.indexOf(step)) setLocalStep(stored);
  }
  const setStep = (next: OnboardingStep) => {
    setLocalStep(next);
    if (user) void store.reachStep(user.id, next);
  };
  const complete = async () => {
    if (user) await store.complete(user.id);
  };

  if (step === 'concept') return <ConceptStep onContinue={() => setStep('goal')} />;
  if (step === 'goal') {
    return (
      <GoalStep
        onDone={(status) => {
          setGoalStatus(status);
          setStep('first-session');
        }}
      />
    );
  }
  return <FirstSessionStep goalStatus={goalStatus} complete={complete} />;
}

const ORDER: readonly OnboardingStep[] = ['concept', 'goal', 'first-session'];

function Body({ children }: { children: string }) {
  const theme = useTheme();
  return <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>{children}</Text>;
}

function ConceptStep({ onContinue }: { onContinue: () => void }) {
  const { home } = useHome();
  const timeOfDay = useSceneTimeOfDay();
  const homeTree = home?.tree ?? null;
  const tree = useMemo(() => (homeTree ? toTreeVisualState(homeTree) : null), [homeTree]);
  return (
    <Screen title="One month, one tree">
      <Body>
        {"Each focus session grows this month's tree. When the month ends, it joins your forest."}
      </Body>
      <View>
        {tree ? (
          <TreeScene tree={tree} timeOfDay={timeOfDay} />
        ) : (
          <SkeletonGroup label="Planting your seed">
            <Skeleton variant="block" />
          </SkeletonGroup>
        )}
      </View>
      {homeTree?.partialFirstMonth ? <Body>This month’s tree starts today.</Body> : null}
      <Button variant="primary" label="Continue" onPress={onContinue} />
    </Screen>
  );
}

function GoalStep({ onDone }: { onDone: (status: string | null) => void }) {
  const goals = useGoals();
  const save = useSetDailyGoal();
  const [error, setError] = useState<string | null>(null);
  const suggested = goals.data?.daily;

  const onSave = (minutes: number) => {
    const before = goals.data;
    setError(null);
    save.mutate(minutes, {
      onSuccess: (after) => onDone(dailySavedText(before, after).replace(/^Saved\. /, '')),
      onError: (cause) => setError(goalErrorText(cause)),
    });
  };

  return (
    <Screen title="A daily goal">
      <Body>A gentle target for each day. Reaching it opens blossoms on your tree.</Body>
      {suggested ? (
        <>
          <Body>{`Suggested: ${formatGoalMinutes(suggested.minutes)}. You can change it anytime.`}</Body>
          <DailyGoalPicker
            initialMinutes={suggested.minutes}
            saveLabel="Set my daily goal"
            onSave={onSave}
            busy={save.isPending}
          >
            {error ? <InlineStatus tone="attention" message={error} live /> : null}
          </DailyGoalPicker>
        </>
      ) : goals.isError ? (
        <InlineStatus
          tone="attention"
          message="Daily goals load when you're online."
          detail="You can set one later in Profile."
          action={{ label: 'Try again', onPress: () => void goals.refetch() }}
        />
      ) : (
        <SkeletonGroup label="Loading the suggested goal">
          <Skeleton variant="text" lines={2} />
        </SkeletonGroup>
      )}
      {/* Skipping keeps no goal: the server's default stays a suggestion. */}
      <Button variant="tertiary" label="Skip for now" onPress={() => onDone(null)} />
    </Screen>
  );
}

function FirstSessionStep({
  goalStatus,
  complete,
}: {
  goalStatus: string | null;
  complete: () => Promise<void>;
}) {
  const router = useRouter();
  return (
    <Screen title="Your first session">
      {goalStatus ? <InlineStatus tone="neutral" message={goalStatus} /> : null}
      <Body>A short session is an easy start. Your tree grows from the first one.</Body>
      <StartFocus open="replace" onFocusOpening={complete} />
      <Button
        variant="tertiary"
        label="Go to Home"
        onPress={() => {
          void complete().then(() => (router.canGoBack() ? router.back() : router.replace('/')));
        }}
      />
    </Screen>
  );
}
