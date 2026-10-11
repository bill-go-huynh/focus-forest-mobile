import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { Leaderboard, LeaderboardPeriod, LeaderboardRow, LeaderboardScope } from '../api';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { ErrorState } from '../components/ErrorState';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { personName } from '../social/social-format';
import { useTheme } from '../theme';
import { useLeaderboard } from './queries';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (date: string) => {
  const [, month = 1, day = 1] = date.split('-').map(Number);
  return `${day} ${MONTHS[month - 1] ?? month}`;
};

/** "Rank 2, Mai Anh, you, 450": what a screen reader hears for one row (docs/11: a plain list). */
export function rowLabel(row: LeaderboardRow): string {
  return [
    `Rank ${row.rank}`,
    personName(row.person),
    ...(row.you ? ['you'] : []),
    String(row.score),
  ].join(', ');
}

/**
 * Leaderboards (docs/05 → Leaderboards; docs/02: fair, opt-in, friends first; docs/01: a plain,
 * readable list with the user's own row highlighted, no podium and no "you dropped"). The event
 * scope (`?scope=event&eventId=`) uses the event's window and shows team ranks.
 */
export function LeaderboardScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ scope?: string; eventId?: string }>();
  const eventId = params.scope === 'event' && params.eventId ? params.eventId : null;
  const [scope, setScope] = useState<LeaderboardScope>(eventId ? 'event' : 'friends');
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const board = useLeaderboard(scope, period, scope === 'event' ? eventId : null);

  return (
    <Screen title="Leaderboards" safeTop={false}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        <Chip label="Friends" selected={scope === 'friends'} onPress={() => setScope('friends')} />
        <Chip label="Global" selected={scope === 'global'} onPress={() => setScope('global')} />
        {eventId ? (
          <Chip label="Event" selected={scope === 'event'} onPress={() => setScope('event')} />
        ) : null}
      </View>
      {scope !== 'event' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          <Chip
            label="This week"
            selected={period === 'weekly'}
            onPress={() => setPeriod('weekly')}
          />
          <Chip
            label="This month"
            selected={period === 'monthly'}
            onPress={() => setPeriod('monthly')}
          />
        </View>
      ) : null}
      <Muted>
        Scores blend days you kept (rest days count), daily goals met, active days, and focus time
        up to a daily limit: never hours alone.
      </Muted>
      {board.isPending ? (
        <SkeletonGroup label="Loading the leaderboard">
          <Skeleton variant="text" lines={5} />
        </SkeletonGroup>
      ) : board.isError ? (
        <ErrorState
          message="We couldn't load this leaderboard right now."
          onRetry={() => void board.refetch()}
        />
      ) : (
        <BoardView board={board.data} />
      )}
    </Screen>
  );
}

function BoardView({ board }: { board: Leaderboard }) {
  const theme = useTheme();
  const router = useRouter();
  const youListed = board.rows.some((row) => row.you);
  return (
    <>
      <Muted>{`${shortDate(board.period.startDate)} – ${shortDate(board.period.endDate)}`}</Muted>
      {!board.optedIn ? (
        <View style={{ gap: theme.space[2] }}>
          <Body>{"You're not on leaderboards. You can turn it on in Privacy."}</Body>
          <Button
            variant="secondary"
            label="Privacy settings"
            onPress={() => router.push('/profile/privacy')}
          />
        </View>
      ) : null}

      {board.teams ? (
        <View testID="leaderboard-teams" style={{ gap: theme.space[1] }}>
          <Header>Teams</Header>
          {board.teams.map((team) => (
            <Line
              key={team.id}
              testID="leaderboard-team"
              label={`Rank ${team.rank}, ${team.name}, ${team.score}, ${team.members} ${team.members === 1 ? 'person' : 'people'}`}
              text={`${team.rank} · ${team.name} · ${team.score}`}
            />
          ))}
        </View>
      ) : null}

      {board.rows.length === 0 ? (
        <Muted>{emptyText(board.period.kind)}</Muted>
      ) : (
        <View testID="leaderboard-rows" style={{ gap: theme.space[1] }}>
          {board.rows.map((row) => (
            <Line
              key={row.person.id}
              testID="leaderboard-row"
              label={rowLabel(row)}
              text={`${row.rank} · ${personName(row.person)}${row.you ? ' (you)' : ''} · ${row.score}`}
              highlighted={row.you}
            />
          ))}
        </View>
      )}
      {board.you && !youListed ? (
        <Line
          testID="leaderboard-you"
          label={rowLabel(board.you)}
          text={`${board.you.rank} · ${personName(board.you.person)} (you) · ${board.you.score}`}
          highlighted
        />
      ) : null}
    </>
  );
}

/** An empty board, framed as a fresh start (docs/02: resets are fresh starts). */
function emptyText(kind: string): string {
  if (kind === 'weekly') return 'Nobody is on this board yet. Each week starts fresh.';
  if (kind === 'monthly') return 'Nobody is on this board yet. Each month starts fresh.';
  return 'Nobody is on this board yet.';
}

/** One row, read as one sentence. The user's own row stands out by weight and a soft fill. */
function Line({
  label,
  text,
  highlighted = false,
  testID,
}: {
  label: string;
  text: string;
  highlighted?: boolean;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={label}
      style={{
        paddingVertical: theme.space[2],
        paddingHorizontal: theme.space[3],
        borderRadius: theme.radius.md,
        backgroundColor: highlighted ? theme.colors.accent.soft : theme.colors.background.primary,
      }}
    >
      <Text
        style={[
          highlighted ? theme.type.bodyStrong : theme.type.body,
          { color: theme.colors.text.primary },
        ]}
      >
        {text}
      </Text>
    </View>
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
