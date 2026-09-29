import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { announce, MIN_TOUCH_TARGET } from '../accessibility';
import { useCompletionIntents } from '../completion/CompletionIntentsProvider';
import { Button } from '../components/Button';
import { Confirmation } from '../components/Confirmation';
import { InlineStatus } from '../components/InlineStatus';
import { ProgressRing } from '../components/ProgressRing';
import { Screen } from '../components/Screen';
import { TopicMark } from '../components/TopicMark';
import {
  useFinishedTimerHandoff,
  useSessionOutboxSnapshot,
} from '../sessions/SessionOutboxProvider';
import type { HandoffResult } from '../sessions/session-handoff';
import { useTheme } from '../theme';
import type { TimerOperationResult } from '../timer/active-timer-store';
import { useActiveTimer, useActiveTimerStore } from '../timer/ActiveTimerProvider';
import { derive, type TimerState } from '../timer/timer-engine';
import { useTopicIdentity } from '../topics/topic-create-sync';
import { NEW_TOPIC_DEFAULTS } from '../topics/topic-form';
import { focusedText, formatCountdown, ringPercent, spokenTimeLeft } from './countdown';
import { formatMinutes } from './duration';
import { useWallClock } from './wall-clock';

type Notice = { message: string; detail?: string };

/** Shown when nothing on the device knows the topic any more: the timer works the same. */
const UNKNOWN_TOPIC_NAME = 'Focus topic';

const CLOCK_NOTICE: Notice = {
  message: 'Your device time changed.',
  detail: 'Focus controls will be available when the clock catches up.',
};

/**
 * A handoff that left the session on the device, waiting for another try. Not one that is
 * only waiting for the outbox to be read, or that another run already finished.
 */
const handoffStuck = (result: HandoffResult) =>
  !result.ok &&
  (result.reason === 'storage_failed' ||
    result.reason === 'clear_failed' ||
    result.reason === 'id_conflict' ||
    result.reason === 'invalid_submission');

const minutesInWords = (minutes: number) => `${minutes} minute${minutes === 1 ? '' : 's'}`;

/**
 * Focus (docs/05 → Timer): a full-screen takeover over the stored timer. It never keeps time
 * itself: every second it reads the clock again and shows what the engine derives from the
 * stored timestamps (docs/07 §4). Pause, resume, and end show only once they are stored. When
 * the engine says the session ended, the store settles it at that instant and the session is
 * handed to the outbox; the screen then shows the minimal finished state the Session
 * Completion screen (M2.12) will replace.
 */
export function FocusScreen() {
  const { status, timer } = useActiveTimer();
  // The session this screen last showed: once it is handed off, the timer is gone.
  const [last, setLast] = useState<TimerState | null>(null);
  if (timer && timer !== last) setLast(timer);

  if (status === 'unavailable') {
    return <NoFocus message="We can't read your focus session on this device right now." />;
  }
  if (status !== 'ready') return <Screen>{null}</Screen>;
  if (timer && !timer.finished) return <RunningFocus timer={timer} />;
  if (timer) return <FinishingFocus />;
  if (last) return <HandedOff session={last} />;
  return <NoFocus message="No focus session is running." />;
}

/** Back to Home: the screen under Focus, or Home itself when Focus was opened alone. */
function useLeave() {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
}

function RunningFocus({ timer }: { timer: TimerState }) {
  const theme = useTheme();
  const timers = useActiveTimerStore();
  const navigation = useNavigation();
  const now = useWallClock(timers.now);
  const view = derive(timer, now);
  const topic = useTopicIdentity(timer.topicId);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const paused = view.mode === 'paused';

  // The plan or the pause limit was reached: store that end, at the instant it happened.
  useEffect(() => {
    if (view.mode === 'finished') void timers.refresh();
  }, [view.mode, timers]);

  // Back never leaves a session running unseen: it asks to end it (the swipe is off).
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        event.preventDefault();
        setConfirming(true);
      }),
    [navigation],
  );

  const operate = async (run: () => Promise<TimerOperationResult>, failure: Notice) => {
    setBusy(true);
    setNotice(null);
    const result = await run();
    setBusy(false);
    if (result.ok || result.reason === 'finished' || result.reason === 'no_timer') return;
    setNotice(result.reason === 'time_went_backwards' ? CLOCK_NOTICE : failure);
  };

  const readTimeLeft = () =>
    void announce(spokenTimeLeft(derive(timer, timers.now()).remainingMilliseconds));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <TopicMark
          icon={topic?.icon ?? NEW_TOPIC_DEFAULTS.icon}
          color={topic?.color ?? null}
          size="lg"
        />
        <View style={{ flexShrink: 1 }}>
          <Text
            accessibilityRole="header"
            style={[theme.type.headline, { color: theme.colors.text.primary }]}
          >
            {topic?.name ?? UNKNOWN_TOPIC_NAME}
          </Text>
          <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>
            {`${formatMinutes(timer.plannedMinutes)} session`}
          </Text>
        </View>
      </View>

      {/* On request only (docs/11): the name never changes, so nothing is read as it ticks. */}
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel="Time left"
        accessibilityHint="Reads the time left aloud."
        onPress={readTimeLeft}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          alignItems: 'center',
          paddingVertical: theme.space[8],
        }}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[theme.type.timer, { color: theme.colors.text.primary }]}
        >
          {formatCountdown(view.remainingMilliseconds)}
        </Text>
        <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>
          {paused ? 'Paused' : 'Time left'}
        </Text>
      </Pressable>

      <ProgressRing
        progress={ringPercent(view.focusedMilliseconds, timer.plannedMinutes)}
        label="Session progress"
        valueText={focusedText(view.focusedMilliseconds, timer.plannedMinutes)}
      />

      {notice ? (
        <InlineStatus tone="attention" message={notice.message} detail={notice.detail} />
      ) : null}

      {/* Large and well apart; End sits away from Pause and asks first (docs/11). */}
      <View style={{ gap: theme.space[12] }}>
        {paused ? (
          <Button
            variant="secondary"
            label="Resume"
            disabled={busy}
            onPress={() =>
              void operate(() => timers.resume(), { message: "We couldn't resume on this device." })
            }
          />
        ) : (
          <Button
            variant="secondary"
            label="Pause"
            disabled={busy}
            onPress={() =>
              void operate(() => timers.pause(), { message: "We couldn't pause on this device." })
            }
          />
        )}
        <Button
          variant="tertiary"
          label="End session"
          disabled={busy}
          onPress={() => setConfirming(true)}
        />
      </View>

      <Confirmation
        visible={confirming}
        presentation="modal"
        title="End this focus session?"
        message={`Your focused time so far will be saved. Sessions count once they reach ${minutesInWords(timer.rules.minValidMinutes)}.`}
        confirmLabel="End session"
        cancelLabel="Keep focusing"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void operate(() => timers.end(), {
            message: "We couldn't end the session on this device.",
          });
        }}
      />
    </Screen>
  );
}

/** The session ended and is on its way to the outbox. */
function FinishingFocus() {
  const theme = useTheme();
  const handoff = useFinishedTimerHandoff();
  const outbox = useSessionOutboxSnapshot();
  const { timer } = useActiveTimer();
  const leave = useLeave();
  const [failed, setFailed] = useState(false);
  const outboxReady = outbox.status === 'ready';
  const timerId = timer?.id;

  // Shares the provider's run when it is already going.
  useEffect(() => {
    if (!outboxReady || !timerId) return;
    void handoff().then((result) => setFailed(handoffStuck(result)));
  }, [handoff, outboxReady, timerId]);

  const retry = () => {
    setFailed(false);
    void handoff().then((result) => setFailed(handoffStuck(result)));
  };

  return (
    <Screen>
      {failed ? (
        <>
          <InlineStatus
            tone="attention"
            message="Your session is still saved on this device."
            detail="Try again in a moment."
            action={{ label: 'Try again', onPress: retry }}
            live
          />
          <Button variant="secondary" label="Back to Home" onPress={leave} />
        </>
      ) : (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          Saving your session.
        </Text>
      )}
    </Screen>
  );
}

/**
 * The session was handed off: Session Completion opens in place of Focus (the navigator
 * replaces this route), whether it ended here or was already over when Focus opened.
 */
function HandedOff({ session }: { session: TimerState }) {
  const theme = useTheme();
  const intents = useCompletionIntents();
  const { userId } = useActiveTimer();
  useEffect(() => {
    if (userId) intents.request({ userId, sessionId: session.id, source: 'foreground' });
  }, [intents, userId, session.id]);
  return (
    <Screen>
      <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
        Saving your session.
      </Text>
    </Screen>
  );
}

function NoFocus({ message }: { message: string }) {
  const theme = useTheme();
  const leave = useLeave();
  return (
    <Screen>
      <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>{message}</Text>
      <Button variant="secondary" label="Back to Home" onPress={leave} />
    </Screen>
  );
}
