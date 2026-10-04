import { Text, View } from 'react-native';

import { InlineStatus } from '../components/InlineStatus';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { formatFocused } from '../history/history-format';
import { useLifetimeStats } from '../insights/queries';
import { useTheme } from '../theme';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Lifetime progress on Profile (spec §3.1, A3.5 `GET /me/profile/stats`): total focus, sessions,
 * the current and longest streak, and completed monthly trees. Quiet lines under the identity,
 * not a dashboard; the join date stays with the profile above. Its loading or failure never
 * touches the identity.
 */
export function LifetimeStats() {
  const theme = useTheme();
  const stats = useLifetimeStats();
  const body = [theme.type.body, { color: theme.colors.text.primary }];

  if (!stats.data) {
    return stats.isError ? (
      <InlineStatus
        tone="info"
        message="Your lifetime stats aren't available right now."
        action={{ label: 'Try again', onPress: () => void stats.refetch() }}
      />
    ) : (
      <SkeletonGroup label="Loading your lifetime stats">
        <Skeleton variant="text" lines={2} />
      </SkeletonGroup>
    );
  }
  const { focusedMilliseconds, sessionCount, currentStreak, longestStreak, archivedTreeCount } =
    stats.data;
  return (
    <View testID="profile-lifetime" style={{ gap: theme.space[1] }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.primary }]}
      >
        Lifetime
      </Text>
      {sessionCount === 0 ? (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          Your lifetime focus starts with your first session.
        </Text>
      ) : (
        <>
          <Text style={body}>{`${formatFocused(focusedMilliseconds)} focused`}</Text>
          <Text style={body}>{plural(sessionCount, 'session')}</Text>
          <Text style={body}>{`Current streak: ${plural(currentStreak, 'day')}`}</Text>
          <Text style={body}>{`Longest streak: ${plural(longestStreak, 'day')}`}</Text>
          <Text style={body}>{plural(archivedTreeCount, 'monthly tree')}</Text>
        </>
      )}
    </View>
  );
}
