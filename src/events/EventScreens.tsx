import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { eventErrorCode, HttpError, NetworkError, type EventCard, type EventInfo } from '../api';
import { FormMessage } from '../auth';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { ListRow } from '../components/ListRow';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useTheme } from '../theme';
import {
  cardLabel,
  groupedNumber,
  milestoneLine,
  missionLine,
  phaseLine,
  rewardsLine,
  stageName,
  windowLine,
} from './event-format';
import { useLeaderboard } from '../leaderboards/queries';
import { useEvent, useEvents, useJoinEvent } from './queries';
import { SectionCard } from '../components/SectionCard';

/**
 * Home's one quiet event card (docs/05 Home: at most one, below the tree and its progress). It
 * says the event's name and either its missions or when it runs; it never pushes.
 */
export function HomeEventCard({ card }: { card: EventCard }) {
  const theme = useTheme();
  const router = useRouter();
  const detail =
    card.joined && card.missionsCompleted !== null
      ? `${card.missionsCompleted} of ${card.missionsTotal} missions`
      : phaseLine(card);
  return (
    <Card
      elevated={false}
      accessibilityLabel={cardLabel(card)}
      onPress={() => router.push(`/together/events/${card.id}`)}
    >
      <View style={{ gap: theme.space[1] }}>
        <Text style={[theme.type.bodyStrong, { color: theme.colors.text.primary }]}>
          {card.name}
        </Text>
        <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>{detail}</Text>
      </View>
    </Card>
  );
}

/** Events in Together (docs/05 → Events): live and upcoming events. Shown only when there are some. */
export function EventsSection() {
  const theme = useTheme();
  const router = useRouter();
  const events = useEvents();
  const items = events.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        <Header>Events</Header>
        {items.map((event) => (
          <ListRow
            key={event.id}
            title={event.name}
            subtitle={`${phaseLine(event)}${event.joined ? ' · Joined' : ''}`}
            onPress={() => router.push(`/together/events/${event.id}`)}
          />
        ))}
      </View>
    </Card>
  );
}

function describeJoinError(error: unknown, fallback: string): string {
  if (error instanceof NetworkError) return "We couldn't reach the server. Check your connection.";
  if (eventErrorCode(error) === 'event_entry_not_met' && error instanceof HttpError) {
    // The server's sentence says how many sessions open the event.
    return error.messages[0] ?? fallback;
  }
  if (eventErrorCode(error) === 'event_ended') return 'This event has ended.';
  return fallback;
}

/**
 * An event (docs/05 → Event detail): key art aside, its dates as information, its missions with
 * progress from normal focus, its milestones and rewards, and the Community Tree when it has one.
 */
export function EventScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const event = useEvent(eventId);
  if (event.isPending) {
    return (
      <Screen safeTop={false}>
        <SkeletonGroup label="Loading the event">
          <Skeleton variant="text" lines={5} />
        </SkeletonGroup>
      </Screen>
    );
  }
  if (event.isError) {
    if (event.error instanceof HttpError && event.error.status === 404) {
      return (
        <Screen safeTop={false}>
          <EmptyState illustration="clearing" message="This event isn't available." />
        </Screen>
      );
    }
    return (
      <Screen safeTop={false}>
        <ErrorState
          message="We couldn't load the event right now."
          onRetry={() => void event.refetch()}
        />
      </Screen>
    );
  }
  return <EventView event={event.data} />;
}

function EventView({ event }: { event: EventInfo }) {
  const theme = useTheme();
  const router = useRouter();
  const join = useJoinEvent(event.id);
  // An event's board, when it has one (A5.8: 404 otherwise).
  const board = useLeaderboard('event', 'weekly', event.id);
  return (
    <Screen title={event.name} safeTop={false}>
      <Body>{event.description}</Body>
      <Muted>{`${windowLine(event)} · ${phaseLine(event)}`}</Muted>
      {!event.joined && event.phase !== 'ended' ? (
        <Button
          variant="primary"
          label="Join event"
          disabled={join.isPending}
          onPress={() => join.mutate()}
        />
      ) : null}
      {join.isError ? (
        <FormMessage
          message={describeJoinError(join.error, "We couldn't join the event. Please try again.")}
        />
      ) : null}

      <SectionCard title="Missions">
        {event.missions.map((mission) => (
          <Body key={mission.id}>{missionLine(mission)}</Body>
        ))}
      </SectionCard>

      <SectionCard title="Milestones">
        {event.milestones.map((milestone) => {
          const rewards = rewardsLine(milestone);
          return (
            <View key={milestone.id} style={{ gap: theme.space[0] }}>
              <Body>{milestoneLine(milestone)}</Body>
              {rewards ? <Muted>{rewards}</Muted> : null}
            </View>
          );
        })}
      </SectionCard>

      {board.data || event.communityTree ? (
        <SectionCard title="Together">
          {board.data ? (
            <ListRow
              title="Leaderboard"
              subtitle={board.data.teams ? 'People and teams' : 'People'}
              onPress={() =>
                router.push({
                  pathname: '/together/leaderboards',
                  params: { scope: 'event', eventId: event.id },
                })
              }
            />
          ) : null}
          {event.communityTree ? (
            <ListRow
              title="Community Tree"
              subtitle={`${groupedNumber(event.communityTree.totalMinutes)} minutes together${event.communityTree.stage ? ` · ${stageName(event.communityTree.stage)}` : ''}`}
              onPress={() => router.push(`/together/community/${event.id}`)}
            />
          ) : null}
        </SectionCard>
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

function Header({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[theme.type.headline, { color: theme.colors.text.primary }]}
    >
      {children}
    </Text>
  );
}
