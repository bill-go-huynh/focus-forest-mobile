import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import { announce, MIN_TOUCH_TARGET, useReducedMotion } from '../accessibility';
import { useCompletionIntents } from '../completion/CompletionIntentsProvider';
import { useHome } from '../core-loop/queries';
import { useSceneTimeOfDay } from '../core-loop/use-scene-time';
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
import { RoomPresence } from '../rooms/RoomPresence';
import { toTreeVisualState, TreeScene } from '../tree';
import { useActiveTimer, useActiveTimerStore } from '../timer/ActiveTimerProvider';
import { derive, type TimerState } from '../timer/timer-engine';
import { useTopicIdentity } from '../topics/topic-create-sync';
import { NEW_TOPIC_DEFAULTS } from '../topics/topic-form';
import { focusedText, formatCountdown, ringPercent, spokenTimeLeft } from './countdown';
import { formatMinutes } from './duration';
import { useWallClock } from './wall-clock';
import { useHaptic } from '../haptics/haptics';

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
const MINUTE_MS = 60_000;

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

  const haptic = useHaptic();
  // The plan or the pause limit was reached: store that end, at the instant it happened. The
  // one haptic a session has marks it (docs/04 §9), never anything while it runs.
  useEffect(() => {
    if (view.mode !== 'finished') return;
    haptic('complete');
    void timers.refresh();
  }, [view.mode, timers, haptic]);

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
  // What is left of the session's pause allowance (the total pause, not this pause alone).
  const pauseLeft = Math.max(0, timer.rules.maxPauseMinutes * MINUTE_MS - view.pausedMilliseconds);

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
          <RoomPresence sessionId={timer.id} />
        </View>
      </View>

      <StatusPill paused={paused} />

      <ProgressRing
        variant="dial"
        tone={paused ? 'rest' : 'forest'}
        progress={ringPercent(view.focusedMilliseconds, timer.plannedMinutes)}
        label="Session progress"
        valueText={focusedText(view.focusedMilliseconds, timer.plannedMinutes)}
      >
        <FocusTree paused={paused} />
      </ProgressRing>

      {/* On request only (docs/11): the name never changes, so nothing is read as it ticks. */}
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel="Time left"
        accessibilityHint="Reads the time left aloud."
        onPress={readTimeLeft}
        style={{ minHeight: MIN_TOUCH_TARGET, alignItems: 'center' }}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[
            theme.type.timer,
            { color: paused ? theme.colors.text.muted : theme.colors.text.primary },
          ]}
        >
          {formatCountdown(view.remainingMilliseconds)}
        </Text>
        <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>
          {paused ? `Pause time left: ${formatCountdown(pauseLeft)}` : 'Time left'}
        </Text>
      </Pressable>

      {notice ? (
        <InlineStatus tone="attention" message={notice.message} detail={notice.detail} />
      ) : null}

      {/* Large and well apart; End sits away from Pause and asks first (docs/11). */}
      <View style={{ gap: theme.space[12] }}>
        {/* Paused, the next step is clear: Resume is the one primary action (docs/01 §8). */}
        {paused ? (
          <Button
            variant="primary"
            label="Resume"
            disabled={busy}
            onPress={() =>
              void operate(() => timers.resume(), {
                message: "We couldn't resume on this device.",
              }).then(() => announce('Focusing'))
            }
          />
        ) : (
          <Button
            variant="secondary"
            label="Pause"
            disabled={busy}
            onPress={() =>
              void operate(() => timers.pause(), {
                message: "We couldn't pause on this device.",
              }).then(() => announce('Paused'))
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

/**
 * Running or paused, in words and in form (docs/11: never by color alone): a filled dot while
 * focusing, two bars while paused.
 */
function StatusPill({ paused }: { paused: boolean }) {
  const theme = useTheme();
  const { colors, space, radius } = theme;
  const mark = paused ? colors.text.accent : colors.forest.primary;
  return (
    <View
      style={{
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        paddingVertical: space[1],
        paddingHorizontal: space[3],
        borderRadius: radius.full,
        backgroundColor: paused ? colors.accent.soft : colors.forest.soft,
      }}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ flexDirection: 'row', gap: space[1] / 2 }}
      >
        {paused ? (
          <>
            <View
              style={{
                width: space[1],
                height: space[3],
                borderRadius: radius.sm,
                backgroundColor: mark,
              }}
            />
            <View
              style={{
                width: space[1],
                height: space[3],
                borderRadius: radius.sm,
                backgroundColor: mark,
              }}
            />
          </>
        ) : (
          <View
            style={{
              width: space[2],
              height: space[2],
              borderRadius: radius.full,
              backgroundColor: mark,
            }}
          />
        )}
      </View>
      <Text style={[theme.type.label, { color: colors.text.primary }]}>
        {paused ? 'Paused' : 'Focusing'}
      </Text>
    </View>
  );
}

/**
 * This month's tree inside the dial (docs/05 → Timer: "a dim, calm scene"). Calm while
 * focusing; dimmed and still while paused. Decorative: the countdown and the dial carry the
 * meaning. Nothing shows until Home is known (it is cached for offline launches).
 */
function FocusTree({ paused }: { paused: boolean }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const timeOfDay = useSceneTimeOfDay();
  const { home } = useHome();
  const homeTree = home?.tree ?? null;
  const tree = useMemo(() => (homeTree ? toTreeVisualState(homeTree) : null), [homeTree]);
  const dimmed = paused ? theme.opacity.muted : 1;
  const [opacity] = useState(() => new Animated.Value(dimmed));
  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(dimmed);
      return;
    }
    Animated.timing(opacity, {
      toValue: dimmed,
      duration: theme.motion.base,
      easing: Easing.bezier(...theme.easing.standard),
      useNativeDriver: true,
    }).start();
  }, [dimmed, reducedMotion, opacity, theme.motion.base, theme.easing.standard]);
  if (!tree) return null;
  const window = theme.progressRing.dial.size - 2 * theme.progressRing.dial.inset;
  return (
    <Animated.View
      testID="focus-tree"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      // Shows the canopy and the ground: the scene is taller than the round window.
      style={{ position: 'absolute', left: 0, right: 0, top: -window / 5, opacity }}
    >
      <TreeScene tree={tree} timeOfDay={timeOfDay} motion="calm" active={!paused} />
    </Animated.View>
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
