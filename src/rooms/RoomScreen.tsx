import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { HttpError, roomErrorCode, useSession, type EarnedBadge, type Room } from '../api';
import { FormMessage } from '../auth';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useSessionRules } from '../focus/session-rules';
import { useTheme } from '../theme';
import { useActiveTimer, useActiveTimerStore } from '../timer/ActiveTimerProvider';
import { useRecentTopics } from '../topics/queries';
import {
  roomKeys,
  useCompleteRoom,
  useJoinRoom,
  useLeaveRoom,
  useRoom,
  useRoomLink,
  useRoomReady,
  useStartRoom,
} from './queries';
import { clearRoomLink, saveRoomLink, type RoomLink } from './room-links';
import { useRoomLive } from './room-live';
import { describeJoinError } from './RoomsSection';
import { InviteFriends } from './RoomInvites';

/** The server's completion window after the start (A5.4 `COMPLETION_LATE_MS`). */
const LATE_START_MS = 10 * 60_000;

const STATE_LABEL = {
  waiting: 'Not ready yet',
  ready: 'Ready',
  focusing: 'Focusing',
  completed: 'Done',
} as const;

/** The device clock in state, ticking every second while `ticking` (never read during render). */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}

/**
 * A focus room (docs/05 → Focus room; docs/02 Focus Together: a shared session is a focus session
 * first). The lobby: who is there and ready, the user's own topic, Ready, and Start for the host.
 * At the server's start time the app starts the user's own timer, as for any session. Once that
 * session is saved, the room is completed with it. No chat, and leaving leaves no trace.
 */
export function RoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const room = useRoom(roomId);
  useRoomLive(roomId);

  if (room.isPending) {
    return (
      <Screen safeTop={false}>
        <SkeletonGroup label="Loading the room">
          <Skeleton variant="text" lines={4} />
        </SkeletonGroup>
      </Screen>
    );
  }
  if (room.isError) {
    if (room.error instanceof HttpError && room.error.status === 404) return <RoomEnded />;
    return (
      <Screen safeTop={false}>
        <ErrorState
          message="We couldn't load the room right now."
          onRetry={() => void room.refetch()}
        />
      </Screen>
    );
  }
  if (room.data.you === null && room.data.phase !== 'lobby') return <RoomEnded />;
  return <RoomView room={room.data} readAt={room.dataUpdatedAt} />;
}

function RoomEnded() {
  return (
    <Screen safeTop={false}>
      <EmptyState illustration="clearing" message="This room has ended." />
    </Screen>
  );
}

/** `readAt`: when the room was last read; a completion not yet possible is tried once per read. */
function RoomView({ room, readAt }: { room: Room; readAt: number }) {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const userId = user?.id ?? null;
  const link = useRoomLink();
  const topics = useRecentTopics();
  const rules = useSessionRules();
  const timers = useActiveTimerStore();
  const { status: timerStatus, timer } = useActiveTimer();
  const ready = useRoomReady(room.id);
  const start = useStartRoom(room.id);
  const leave = useLeaveRoom(room.id);
  const join = useJoinRoom();
  const complete = useCompleteRoom(room.id);
  const [badges, setBadges] = useState<EarnedBadge[] | null>(null);
  const [waitingForSave, setWaitingForSave] = useState(false);
  const starting = useRef(false);

  const completing = useRef(false);
  const lastAttempt = useRef<string | null>(null);
  const now = useNow(room.startsAt !== null && room.phase !== 'ended' && room.phase !== 'closed');
  // The countdown to the server's shared start, on this device's clock.
  const seconds =
    room.phase === 'countdown' && room.startsAt
      ? Math.max(0, Math.ceil((Date.parse(room.startsAt) - now) / 1_000))
      : null;
  // Started more than ten minutes ago: a session begun now could not complete the room (A5.4).
  const tooLate = room.startsAt !== null && now - Date.parse(room.startsAt) > LATE_START_MS;

  const ownLink: RoomLink | null = link.data?.roomId === room.id ? link.data : null;
  const [topicId, setTopicId] = useState<string | null>(null);
  const chosenTopic = topicId ?? ownLink?.topicId ?? null;

  const writeLink = async (next: Omit<RoomLink, 'version'> | null) => {
    if (!userId) return;
    if (next) await saveRoomLink(userId, next);
    else await clearRoomLink(userId);
    queryClient.setQueryData(roomKeys.link(userId), next ? { version: 1, ...next } : null);
  };

  // The countdown reached the shared start (its clock ticks in state, never during render).
  const started = room.phase === 'focusing' || (room.phase === 'countdown' && seconds === 0);

  // At the shared start, the user's own session begins, like any session (the room never submits).
  useEffect(() => {
    if (!started || room.you?.state !== 'focusing' || !ownLink || ownLink.sessionId !== null)
      return;
    if (timerStatus !== 'ready' || timer !== null || rules.status !== 'ready' || starting.current) {
      return;
    }
    if (tooLate) return;
    starting.current = true;
    void (async () => {
      const result = await timers.start({
        topicId: ownLink.topicId,
        plannedMinutes: room.durationMinutes,
        rules: {
          minValidMinutes: rules.rules.minValidMinutes,
          maxPauseMinutes: rules.rules.maxPauseMinutes,
        },
      });
      if (result.ok) {
        await writeLink({ roomId: room.id, topicId: ownLink.topicId, sessionId: result.timer.id });
        router.push('/focus');
      }
      starting.current = false;
    })();
  });

  // Once the session is saved (no longer the running timer), it completes the room.
  useEffect(() => {
    const sessionId = ownLink?.sessionId ?? null;
    if (!sessionId || room.you?.state !== 'focusing' || completing.current) return;
    if (timerStatus !== 'ready' || timer?.id === sessionId) return;
    const attempt = `${sessionId}:${readAt}`;
    if (lastAttempt.current === attempt) return;
    lastAttempt.current = attempt;
    completing.current = true;
    complete.mutate(sessionId, {
      onSuccess: (result) => {
        setWaitingForSave(false);
        setBadges(result.progression.newlyEarnedBadges);
        void writeLink(null);
      },
      onError: (error) => {
        // Not saved yet (offline, or still in the outbox): tried again with the next room read.
        if (roomErrorCode(error) === 'session_not_found') setWaitingForSave(true);
        else void writeLink(null);
      },
      onSettled: () => {
        completing.current = false;
      },
    });
  });

  const getReady = async () => {
    if (!chosenTopic) return;
    await writeLink({ roomId: room.id, topicId: chosenTopic, sessionId: null });
    ready.mutate(true);
  };

  const leaveRoom = () =>
    leave.mutate(undefined, {
      onSuccess: () => {
        void writeLink(null);
        // Back to the Together hub, wherever the room was opened from.
        router.navigate('/together');
      },
    });

  const lateForSession =
    tooLate && started && room.you?.state === 'focusing' && ownLink?.sessionId === null;
  const status = lateForSession
    ? "This room started more than ten minutes ago, so this session can't join it."
    : room.you?.state === 'completed' || badges
      ? 'You focused together.'
      : waitingForSave
        ? "We're saving your session; the room completes once it's saved."
        : room.phase === 'countdown' && seconds !== null && seconds > 0
          ? `Starting in ${seconds} s`
          : room.phase === 'focusing' || started
            ? 'Focusing together'
            : null;

  return (
    <Screen title={room.name} safeTop={false}>
      <Muted>{`${room.durationMinutes} min${room.topic ? ` · ${room.topic}` : ''}`}</Muted>
      {room.code ? <Muted>{`Code ${room.code}`}</Muted> : null}
      <View testID="room-status">{status ? <Body>{status}</Body> : null}</View>
      {badges?.map((badge) => (
        <Body key={badge.id}>{badge.name}</Body>
      ))}

      <View style={{ gap: theme.space[1] }}>
        {room.participants.map((place) => {
          const name =
            place.user.displayName ?? (place.user.username ? `@${place.user.username}` : 'Someone');
          const parts = [
            place.user.id === userId ? `${name} (you)` : name,
            ...(place.host ? ['Host'] : []),
            STATE_LABEL[place.state],
          ];
          return <Body key={place.user.id}>{parts.join(' · ')}</Body>;
        })}
      </View>

      {room.phase === 'lobby' && room.you ? (
        <View style={{ gap: theme.space[3] }}>
          {room.you.state === 'waiting' ? (
            <>
              <Text style={[theme.type.label, { color: theme.colors.text.primary }]}>
                Your topic
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
                {(topics.data ?? []).map((topic) => (
                  <Chip
                    key={topic.id}
                    label={topic.name}
                    selected={chosenTopic === topic.id}
                    onPress={() => setTopicId(topic.id)}
                  />
                ))}
              </View>
              <Button
                variant="primary"
                label="I'm ready"
                disabled={!chosenTopic || ready.isPending}
                disabledReason="Choose your topic first."
                onPress={() => void getReady()}
              />
            </>
          ) : (
            <Button
              variant="secondary"
              label="Not ready"
              disabled={ready.isPending}
              onPress={() => ready.mutate(false)}
            />
          )}
          <InviteFriends roomId={room.id} present={room.participants.map((p) => p.user.id)} />
          {room.you.host ? (
            <Button
              variant="secondary"
              label="Start now"
              disabled={start.isPending}
              onPress={() => start.mutate()}
            />
          ) : null}
          {start.isError ? (
            <FormMessage
              message={
                roomErrorCode(start.error) === 'not_enough_ready'
                  ? 'At least two people need to be ready to start.'
                  : "We couldn't start the room. Please try again."
              }
            />
          ) : null}
        </View>
      ) : null}

      {room.phase === 'lobby' && !room.you ? (
        // Someone invited, or who opened a gathering room's link (M6.2): they may join here.
        <View style={{ gap: theme.space[2] }}>
          <Button
            variant="primary"
            label="Join room"
            disabled={join.isPending}
            onPress={() => join.mutate({ roomId: room.id })}
          />
          {join.isError ? <FormMessage message={describeJoinError(join.error)} /> : null}
        </View>
      ) : null}

      {room.you && room.you.state !== 'completed' ? (
        <Button
          variant="tertiary"
          label="Leave room"
          disabled={leave.isPending}
          onPress={leaveRoom}
        />
      ) : null}
    </Screen>
  );
}

function Body({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>{children}</Text>;
}

function Muted({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>{children}</Text>;
}
