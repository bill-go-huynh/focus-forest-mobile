import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import type { HistoryFilters, SessionHistoryItem } from '../api';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { InlineStatus } from '../components/InlineStatus';
import { ListRow } from '../components/ListRow';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { TopicMark } from '../components/TopicMark';
import { useTheme } from '../theme';
import {
  formatFocused,
  formatLocalDate,
  formatStartTime,
  groupByLocalDate,
  outcomeLabel,
} from './history-format';
import { useSessionHistory } from './queries';

/**
 * Insights → Focus history, Phase 2 basic (docs/05 §2, §3): the server's sessions grouped by
 * their persisted day, each with its topic, time, outcome, and focused time. Pages load on
 * request. Offline it shows the history saved on this device. A row opens the session.
 */
export function HistoryScreen() {
  const theme = useTheme();
  return (
    <Screen title="Insights">
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.primary }]}
      >
        Focus history
      </Text>
      <HistoryContent />
    </Screen>
  );
}

/**
 * The history list (M3.5: on Insights, under its filters). With `filters`, the server's filtered
 * sessions; discarded sessions stay listed ("Not counted"), they just add no focus.
 */
export function HistoryContent({ filters = null }: { filters?: HistoryFilters | null } = {}) {
  const theme = useTheme();
  const router = useRouter();
  const { query, items, fromDevice } = useSessionHistory(filters);
  const filtered = filters !== null && Object.values(filters).some((v) => v !== undefined);

  if (items === null) {
    if (query.isError) {
      return (
        <ErrorState
          message="We couldn't load your focus history right now."
          onRetry={() => void query.refetch()}
        />
      );
    }
    return (
      <SkeletonGroup label="Loading your focus history">
        <Skeleton variant="text" lines={3} />
      </SkeletonGroup>
    );
  }

  if (items.length === 0 && !fromDevice && filtered) {
    return (
      <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
        No sessions match these filters.
      </Text>
    );
  }

  if (items.length === 0 && !fromDevice) {
    return (
      <EmptyState
        illustration="lantern"
        message="Your focus story begins with your first session."
        action={{ label: 'Go to your tree', onPress: () => router.navigate('/') }}
      />
    );
  }

  const open = (item: SessionHistoryItem) =>
    router.push({ pathname: '/completion/[sessionId]', params: { sessionId: item.id } });
  const showingSaved = (fromDevice && query.isError) || query.isRefetchError;

  return (
    <View style={{ gap: theme.space[5] }}>
      {showingSaved ? (
        <InlineStatus
          tone="info"
          message="Showing history saved on this device."
          action={{ label: 'Try again', onPress: () => void query.refetch() }}
        />
      ) : null}
      {groupByLocalDate(items).map((day) => (
        <View
          key={day.localDate}
          testID={`history-day-${day.localDate}`}
          style={{ gap: theme.space[1] }}
        >
          <Text
            accessibilityRole="header"
            style={[theme.type.bodyStrong, { color: theme.colors.text.secondary }]}
          >
            {formatLocalDate(day.localDate)}
          </Text>
          {day.items.map((item) => (
            <ListRow
              key={item.id}
              title={item.topic.name}
              subtitle={`${formatStartTime(item.startedAt)} · ${outcomeLabel(item)}`}
              meta={formatFocused(item.focusedMilliseconds)}
              leading={() => <TopicMark color={item.topic.color} icon={item.topic.icon} />}
              onPress={() => open(item)}
              accessibilityHint="Opens this session."
            />
          ))}
        </View>
      ))}
      {!fromDevice && query.hasNextPage ? (
        query.isFetchNextPageError ? (
          <InlineStatus
            tone="info"
            message="We couldn't load more sessions right now."
            action={{ label: 'Try again', onPress: () => void query.fetchNextPage() }}
          />
        ) : (
          <Button
            variant="secondary"
            label="Load more sessions"
            disabled={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
          />
        )
      ) : null}
    </View>
  );
}
