import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { VisitedForestItem } from '../api';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { Screen } from '../components/Screen';
import { Sheet } from '../components/Sheet';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { RestingMarker } from '../forest/ForestScreen';
import { formatFocused } from '../history/history-format';
import { useTheme } from '../theme';
import { TreeScene } from '../tree/TreeScene';
import { toTreeVisualState } from '../tree/visual-state';
import { useVisitedForest, useVisitedMonth, useVisitedProfile } from './queries';
import { ReactionBar } from './ReactionBar';
import { monthYear, personName, treeTarget } from './social-format';

const MINUTE = 60_000;

/**
 * Visiting a forest (docs/02 Social: it should feel like a visit, with their trees as the hero,
 * not a stats comparison). The timeline carries no focus numbers; an archived month opens its
 * record as far as the owner's privacy allows. A visit only reads: it changes nothing.
 */
export function VisitedForestScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const theme = useTheme();
  const profile = useVisitedProfile(userId);
  const forest = useVisitedForest(userId);
  const [open, setOpen] = useState<{ year: number; month: number } | null>(null);
  const title = profile.data ? `${personName(profile.data.user)}'s forest` : 'Forest';

  return (
    <Screen title={title} safeTop={false}>
      {forest.isPending ? (
        <SkeletonGroup label="Loading their forest">
          <Skeleton variant="text" lines={3} />
        </SkeletonGroup>
      ) : forest.isError ? (
        <ErrorState
          message="We couldn't load this forest right now."
          onRetry={() => void forest.refetch()}
        />
      ) : (
        <>
          <ReactionBar userId={userId} target="forest" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[4] }}>
            {forest.data.pages
              .flatMap((page) => page.items)
              .map((item) => (
                <Month
                  key={`${item.year}-${item.month}`}
                  item={item}
                  onOpen={() => setOpen({ year: item.year, month: item.month })}
                />
              ))}
          </View>
          {forest.hasNextPage ? (
            <Button
              variant="tertiary"
              label="Show earlier months"
              onPress={() => void forest.fetchNextPage()}
              disabled={forest.isFetchingNextPage}
            />
          ) : null}
        </>
      )}
      <Sheet
        visible={open !== null}
        title={open ? monthYear(open) : 'Month'}
        onRequestClose={() => setOpen(null)}
      >
        {open ? <MonthRecord userId={userId} month={open} /> : null}
      </Sheet>
    </Screen>
  );
}

function Month({ item, onOpen }: { item: VisitedForestItem; onOpen: () => void }) {
  const theme = useTheme();
  const caption = [theme.type.caption, { color: theme.colors.text.secondary }];
  if (item.kind === 'resting') {
    return (
      <View style={{ alignItems: 'center', gap: theme.space[1] }}>
        <RestingMarker />
        <Text style={caption}>A quiet month</Text>
      </View>
    );
  }
  if (item.kind === 'growing') {
    return (
      <View style={{ alignItems: 'center', gap: theme.space[1] }}>
        {item.tree ? (
          <TreeScene
            tree={toTreeVisualState(item.tree)}
            size="thumbnail"
            motion="still"
            active={false}
          />
        ) : null}
        <Text style={caption}>Growing now</Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${monthYear(item)}, archived tree`}
      onPress={onOpen}
      style={{ alignItems: 'center', gap: theme.space[1] }}
    >
      <TreeScene
        tree={toTreeVisualState(item.tree)}
        size="thumbnail"
        motion="still"
        active={false}
      />
      <Text style={caption}>{monthYear(item)}</Text>
    </Pressable>
  );
}

function MonthRecord({
  userId,
  month,
}: {
  userId: string;
  month: { year: number; month: number };
}) {
  const theme = useTheme();
  const record = useVisitedMonth(userId, month);
  if (record.isPending) {
    return (
      <SkeletonGroup label="Loading the month">
        <Skeleton variant="text" lines={2} />
      </SkeletonGroup>
    );
  }
  if (record.isError) {
    return (
      <ErrorState
        message="We couldn't load this month right now."
        onRetry={() => void record.refetch()}
      />
    );
  }
  const data = record.data;
  if (data.kind !== 'archived') return null;
  return (
    <View style={{ gap: theme.space[3] }}>
      <TreeScene tree={toTreeVisualState(data.tree)} size="thumbnail" motion="still" />
      {data.stats ? (
        <Body>{`${formatFocused(data.stats.focusedMinutes * MINUTE)} focused · ${data.stats.sessionCount} sessions`}</Body>
      ) : null}
      {data.badges && data.badges.length > 0 ? (
        <View style={{ gap: theme.space[1] }}>
          {data.badges.map((badge) => (
            <Body key={badge.id}>{badge.name}</Body>
          ))}
        </View>
      ) : null}
      <ReactionBar userId={userId} target={treeTarget(data)} />
    </View>
  );
}

function Body({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>{children}</Text>;
}
