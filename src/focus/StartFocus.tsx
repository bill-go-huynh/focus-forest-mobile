import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { SessionRulesResponse } from '../api';
import { useFontScale } from '../accessibility';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { InlineStatus } from '../components/InlineStatus';
import { ListRow } from '../components/ListRow';
import { Sheet } from '../components/Sheet';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { TopicMark } from '../components/TopicMark';
import { useFinishedTimerHandoff } from '../sessions/SessionOutboxProvider';
import { useTheme } from '../theme';
import { useActiveTimer, useActiveTimerStore } from '../timer/ActiveTimerProvider';
import { usePickerTopics, type PickerTopic } from '../topics/topic-create-sync';
import { pendingSyncLabel } from '../topics/topic-form';
import { CreateTopicSheet } from '../topics/TopicSheets';
import {
  formatMinutes,
  lowestSelectableMinutes,
  NO_DURATION_MESSAGE,
  quickStartMinutes,
  startMinutesForTopic,
} from './duration';
import { DurationSheet } from './DurationSheet';
import { useSessionRules } from './session-rules';

type Step = 'closed' | 'topics' | 'duration' | 'create';
type Notice = { message: string; detail?: string };

const topicId = (entry: PickerTopic) => (entry.kind === 'confirmed' ? entry.topic.id : entry.id);
const topicName = (entry: PickerTopic) =>
  entry.kind === 'confirmed' ? entry.topic.name : entry.name;

/**
 * Start Focus on Home (docs/05 §1: the primary action next to the tree). With a running or
 * paused timer it reads Resume focus and reopens it, never starting another; it first moves a
 * finished one to the outbox (sharing the provider's handoff), then
 * lets a topic be chosen. A topic with a usable remembered duration starts at once (docs/02:
 * two taps); otherwise, or through "Change duration", the duration is chosen first. The timer
 * is stored before the Focus screen opens, with the session rules copied into it.
 */
export function StartFocus() {
  const router = useRouter();
  const timers = useActiveTimerStore();
  const timer = useActiveTimer();
  const handoff = useFinishedTimerHandoff();
  const rules = useSessionRules();
  const [step, setStep] = useState<Step>('closed');
  const [choice, setChoice] = useState<{ entry: PickerTopic; minutes: number } | null>(null);
  const [homeNotice, setHomeNotice] = useState<Notice | null>(null);
  const [startFailed, setStartFailed] = useState(false);

  const openFocus = () => {
    setStep('closed');
    router.push('/focus');
  };

  const onStartFocus = async () => {
    setHomeNotice(null);
    const current = timers.getSnapshot().timer;
    if (current && !current.finished) {
      openFocus();
      return;
    }
    if (current) {
      // The finished session goes to the outbox first; never a second timer over it.
      const handed = await handoff();
      if (!handed.ok && timers.getSnapshot().timer) {
        setHomeNotice({
          message: 'Your last session is still being saved on this device.',
          detail: 'Try again in a moment.',
        });
        return;
      }
    }
    setStartFailed(false);
    setStep('topics');
  };

  const start = async (entry: PickerTopic, minutes: number, current: SessionRulesResponse) => {
    setStartFailed(false);
    const started = await timers.start({
      topicId: topicId(entry),
      plannedMinutes: minutes,
      rules: {
        minValidMinutes: current.minValidMinutes,
        maxPauseMinutes: current.maxPauseMinutes,
      },
    });
    // Opened only once the timer is stored (or one already runs).
    if (started.ok || started.reason === 'timer_exists') {
      openFocus();
      return;
    }
    setStartFailed(true);
    setStep('topics');
  };

  const chooseDuration = (entry: PickerTopic, current: SessionRulesResponse) => {
    const minutes = startMinutesForTopic(entry, current);
    if (minutes === null) return;
    setChoice({ entry, minutes });
    setStep('duration');
  };

  const onTopic = (entry: PickerTopic) => {
    if (rules.status !== 'ready') return;
    const quick = quickStartMinutes(entry, rules.rules);
    if (quick !== null) void start(entry, quick, rules.rules);
    else chooseDuration(entry, rules.rules);
  };

  // A running or paused session is resumed, never replaced: the action says so.
  const active = timer.timer !== null && !timer.timer.finished;

  return (
    <>
      <Button
        variant="primary"
        label={active ? 'Resume focus' : 'Start Focus'}
        onPress={() => void onStartFocus()}
        disabled={timer.status !== 'ready'}
        disabledReason="Your focus session is loading."
      />
      {homeNotice ? (
        <InlineStatus
          tone="attention"
          message={homeNotice.message}
          detail={homeNotice.detail}
          live
        />
      ) : null}
      <Sheet
        visible={step === 'topics'}
        onRequestClose={() => setStep('closed')}
        title="Choose a topic"
      >
        <TopicChoices
          rules={rules}
          startFailed={startFailed}
          onTopic={onTopic}
          onChangeDuration={(entry) => {
            if (rules.status === 'ready') chooseDuration(entry, rules.rules);
          }}
          onCreate={() => setStep('create')}
        />
      </Sheet>
      <DurationSheet
        visible={step === 'duration'}
        initialMinutes={choice?.minutes ?? 15}
        minimumMinutes={rules.rules?.minValidMinutes}
        confirmLabel="Start focus"
        onConfirm={(minutes) => {
          if (choice && rules.status === 'ready') void start(choice.entry, minutes, rules.rules);
        }}
        onCancel={() => setStep('topics')}
      />
      <CreateTopicSheet visible={step === 'create'} onClose={() => setStep('topics')} />
    </>
  );
}

function TopicChoices({
  rules,
  startFailed,
  onTopic,
  onChangeDuration,
  onCreate,
}: {
  rules: ReturnType<typeof useSessionRules>;
  startFailed: boolean;
  onTopic: (entry: PickerTopic) => void;
  onChangeDuration: (entry: PickerTopic) => void;
  onCreate: () => void;
}) {
  const theme = useTheme();
  const { isLargeText } = useFontScale();
  const { items, recent } = usePickerTopics();
  const noDuration =
    rules.status === 'ready' && lowestSelectableMinutes(rules.rules.minValidMinutes) === null;
  const unavailableReason =
    rules.status === 'loading'
      ? 'Focus settings are loading.'
      : rules.status === 'unavailable'
        ? "Focus settings aren't available right now."
        : noDuration
          ? NO_DURATION_MESSAGE
          : undefined;

  return (
    <View style={{ gap: theme.space[3] }}>
      {rules.status === 'unavailable' ? (
        <InlineStatus
          tone="attention"
          message="Focus settings aren't available right now."
          detail="They load the next time you are online."
          action={{ label: 'Try again', onPress: rules.retry }}
        />
      ) : null}
      {noDuration ? <InlineStatus tone="attention" message={NO_DURATION_MESSAGE} /> : null}
      {startFailed ? (
        <InlineStatus
          tone="attention"
          message="We couldn't start this focus session on your device."
          detail="Try again."
          live
        />
      ) : null}
      {recent.isError && items.length > 0 ? (
        <InlineStatus tone="info" message="Showing topics saved on this device." />
      ) : null}
      {items.length === 0 ? (
        recent.isPending ? (
          <SkeletonGroup label="Loading your topics">
            <Skeleton variant="text" lines={3} />
          </SkeletonGroup>
        ) : recent.isError ? (
          <ErrorState
            message="We couldn't load your topics right now."
            onRetry={() => void recent.refetch()}
          />
        ) : (
          <EmptyState
            illustration="seed-in-soil"
            message="Create a topic to focus on."
            action={{ label: 'Create topic', onPress: onCreate }}
          />
        )
      ) : (
        <>
          {items.map((entry) => {
            const name = topicName(entry);
            const quick = rules.status === 'ready' ? quickStartMinutes(entry, rules.rules) : null;
            const mark =
              entry.kind === 'confirmed'
                ? { color: entry.topic.color, icon: entry.topic.icon }
                : { color: entry.color, icon: entry.icon };
            return (
              <View
                key={topicId(entry)}
                style={{
                  flexDirection: isLargeText ? 'column' : 'row',
                  alignItems: isLargeText ? 'stretch' : 'center',
                  gap: theme.space[1],
                }}
              >
                <View style={{ flex: isLargeText ? undefined : 1 }}>
                  <ListRow
                    title={name}
                    subtitle={
                      entry.kind === 'pending' ? pendingSyncLabel(entry.syncState) : undefined
                    }
                    meta={quick !== null ? formatMinutes(quick) : undefined}
                    leading={() => <TopicMark {...mark} />}
                    onPress={() => onTopic(entry)}
                    disabled={unavailableReason !== undefined}
                    disabledReason={unavailableReason}
                    accessibilityHint={
                      quick !== null
                        ? 'Starts focus with this duration.'
                        : 'Choose a duration first.'
                    }
                  />
                </View>
                {quick !== null && unavailableReason === undefined ? (
                  <Button
                    variant="tertiary"
                    label="Change duration"
                    accessibilityLabel={`Change duration for ${name}`}
                    onPress={() => onChangeDuration(entry)}
                  />
                ) : null}
              </View>
            );
          })}
          <Button variant="tertiary" label="New topic" onPress={onCreate} />
        </>
      )}
    </View>
  );
}
