import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Leaderboard, LeaderboardPeriod, LeaderboardRow, LeaderboardScope } from '../api';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { ErrorState } from '../components/ErrorState';
import { Screen } from '../components/Screen';
import { SectionCard } from '../components/SectionCard';
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
 * readable list with the user's own row highlighted, no podium and no "you dropped"). One card
 * holds the choices and the dates, one the board: rank, name, score per row (owner, 2026-10-23).
 */
export function LeaderboardScreen() {
  const theme = useTheme();
  const [scope, setScope] = useState<LeaderboardScope>('friends');
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const board = useLeaderboard(scope, period);

  return (
    <Screen title="Leaderboards" safeTop={false}>
      <SectionCard>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          <Chip
            label="Friends"
            selected={scope === 'friends'}
            onPress={() => setScope('friends')}
          />
          <Chip label="Global" selected={scope === 'global'} onPress={() => setScope('global')} />
        </View>
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
        {board.data ? (
          <Caption>{`${shortDate(board.data.period.startDate)} – ${shortDate(board.data.period.endDate)}`}</Caption>
        ) : null}
      </SectionCard>
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
      <Caption>
        Scores blend days you kept (rest days count), daily goals met, active days, and focus time
        up to a daily limit: never hours alone.
      </Caption>
    </Screen>
  );
}

function BoardView({ board }: { board: Leaderboard }) {
  const theme = useTheme();
  const router = useRouter();
  const youListed = board.rows.some((row) => row.you);
  return (
    <>
      {!board.optedIn ? (
        <SectionCard>
          <Body>{"You're not on leaderboards. You can turn it on in Privacy."}</Body>
          <Button
            variant="secondary"
            label="Privacy settings"
            onPress={() => router.push('/profile/privacy')}
          />
        </SectionCard>
      ) : null}

      <SectionCard>
        {board.rows.length === 0 ? (
          <Body>{emptyText(board.period.kind)}</Body>
        ) : (
          <View testID="leaderboard-rows">
            {board.rows.map((row, index) => (
              <View key={row.person.id}>
                {index > 0 ? <Divider /> : null}
                <Line testID="leaderboard-row" row={row} />
              </View>
            ))}
          </View>
        )}
        {board.you && !youListed ? (
          <View style={{ gap: theme.space[2] }}>
            <Caption>Your place</Caption>
            <Line testID="leaderboard-you" row={board.you} />
          </View>
        ) : null}
      </SectionCard>
    </>
  );
}

/** An empty board, framed as a fresh start (docs/02: resets are fresh starts). */
function emptyText(kind: string): string {
  if (kind === 'weekly') return 'Nobody is on this board yet. Each week starts fresh.';
  if (kind === 'monthly') return 'Nobody is on this board yet. Each month starts fresh.';
  return 'Nobody is on this board yet.';
}

/**
 * One row, read as one sentence: the rank in a quiet circle (the same for every rank, never a
 * medal), the name with a "You" mark on the user's own row, and the score. The user's row
 * stands out by a soft fill and weight.
 */
function Line({ row, testID }: { row: LeaderboardRow; testID: string }) {
  const theme = useTheme();
  const strong = row.you ? theme.type.bodyStrong : theme.type.body;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={rowLabel(row)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        paddingVertical: theme.space[2],
        paddingHorizontal: theme.space[2],
        borderRadius: theme.radius.md,
        backgroundColor: row.you ? theme.colors.accent.soft : 'transparent',
      }}
    >
      <View
        style={{
          minWidth: theme.space[8],
          height: theme.space[8],
          paddingHorizontal: theme.space[1],
          borderRadius: theme.radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: row.you ? theme.colors.surface.primary : theme.colors.surface.sunken,
        }}
      >
        <Text style={[theme.type.label, { color: theme.colors.text.primary }]}>{row.rank}</Text>
      </View>
      <View style={{ flex: 1, gap: theme.space[0] }}>
        <Text style={[strong, { color: theme.colors.text.primary }]} numberOfLines={1}>
          {personName(row.person)}
        </Text>
        {row.you || row.person.username ? (
          <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>
            {row.you ? 'You' : `@${row.person.username}`}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[theme.type.headline, { color: theme.colors.text.primary }]}>{row.score}</Text>
        <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>points</Text>
      </View>
    </View>
  );
}

function Divider() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        marginHorizontal: theme.space[2],
        backgroundColor: theme.colors.border.subtle,
      }}
    />
  );
}

function Body({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>{children}</Text>;
}

function Caption({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>{children}</Text>
  );
}
