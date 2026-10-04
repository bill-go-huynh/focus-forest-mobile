import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';

import type { MonthRef, TreeDetails } from '../api';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useTheme } from '../theme';
import { toTreeVisualState, TreeScene } from '../tree';
import { formatMinutes, monthTitle } from './forest-format';
import { RestingMarker } from './ForestScreen';
import { useTreeDetails } from './queries';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Tree Details for a forest month (docs/03 §12, docs/05; M3.4). An archived month shows its
 * frozen tree at rest and the snapshot taken at archive: stats, top topic as named then, and the
 * highlighted notes as they read then (never the live sessions), then "View recap". Badges and
 * events show only once there are some. A quiet month says so calmly, with no tree.
 */
export function MonthDetailsScreen({ month }: { month: MonthRef }) {
  const details = useTreeDetails(month);
  if (details.data) return <Details details={details.data} />;
  return (
    <Screen title={monthTitle(month)} safeTop={false}>
      {details.isError ? (
        <ErrorState
          illustration="clearing"
          message="We couldn't load this month right now."
          onRetry={() => void details.refetch()}
        />
      ) : (
        <SkeletonGroup label="Loading this month">
          <Skeleton variant="block" />
        </SkeletonGroup>
      )}
    </Screen>
  );
}

function Details({ details }: { details: TreeDetails }) {
  const theme = useTheme();
  const router = useRouter();
  const tree = useMemo(
    () => ('tree' in details ? toTreeVisualState(details.tree) : null),
    [details],
  );
  const body = [theme.type.body, { color: theme.colors.text.primary }];
  const header = [theme.type.headline, { color: theme.colors.text.primary }];

  if (details.kind === 'resting') {
    return (
      <Screen title={monthTitle(details)} safeTop={false}>
        <RestingMarker />
        <Text style={body}>This was a quiet month in your forest.</Text>
      </Screen>
    );
  }

  if (details.kind === 'growing') {
    const { stats } = details;
    return (
      <Screen title={monthTitle(details)} safeTop={false}>
        {tree ? <TreeScene tree={tree} /> : null}
        <Text style={body}>{`${formatMinutes(stats.focusedMinutes)} focused`}</Text>
        <Text style={body}>{plural(stats.sessionCount, 'session')}</Text>
        <Text style={body}>{plural(stats.activeDays, 'active day')}</Text>
      </Screen>
    );
  }

  const { stats, highlightedNotes, badges, events } = details;
  return (
    <Screen title={monthTitle(details)} safeTop={false}>
      {tree ? <TreeScene tree={tree} /> : null}
      <View style={{ gap: theme.space[2] }}>
        <Text accessibilityRole="header" style={header}>
          The month
        </Text>
        <Text style={body}>{`${formatMinutes(stats.focusedMinutes)} focused`}</Text>
        <Text style={body}>{plural(stats.sessionCount, 'session')}</Text>
        <Text style={body}>{plural(stats.activeDays, 'active day')}</Text>
        {stats.topTopic ? <Text style={body}>{`Top topic: ${stats.topTopic.name}`}</Text> : null}
        {stats.longestStreak > 0 ? (
          <Text style={body}>{`Longest streak: ${plural(stats.longestStreak, 'day')}`}</Text>
        ) : null}
        <Text style={body}>{`Daily goals met: ${stats.dailyGoalsMet}`}</Text>
        <Text style={body}>{`Weekly goals met: ${stats.weeklyGoalsMet}`}</Text>
      </View>
      {highlightedNotes.length > 0 ? (
        <View style={{ gap: theme.space[2] }}>
          <Text accessibilityRole="header" style={header}>
            Highlighted notes
          </Text>
          {highlightedNotes.map((note) => (
            <Text key={note.sessionId} style={body}>
              {note.note}
            </Text>
          ))}
        </View>
      ) : null}
      {/* Badges and events arrive in later phases: nothing is shown while there are none. */}
      {badges.length > 0 ? <Text style={body}>{plural(badges.length, 'badge')}</Text> : null}
      {events.length > 0 ? <Text style={body}>{plural(events.length, 'event')}</Text> : null}
      <Button
        variant="primary"
        label="View recap"
        onPress={() =>
          router.push({
            pathname: '/recap/[year]/[month]',
            params: { year: String(details.year), month: String(details.month) },
          })
        }
      />
    </Screen>
  );
}
