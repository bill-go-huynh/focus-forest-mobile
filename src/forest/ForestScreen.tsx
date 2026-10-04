import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import type { ForestItem } from '../api';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { InlineStatus } from '../components/InlineStatus';
import { ListRow } from '../components/ListRow';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useTheme } from '../theme';
import { toTreeVisualState, TreeScene } from '../tree';
import {
  forestItemLabel,
  forestSummaryText,
  groupByYear,
  monthKey,
  monthTitle,
  shortMonth,
} from './forest-format';
import { useForest } from './queries';

/** Bounds for the landscape list: only a few trees are drawn at a time. */
const LANDSCAPE_WINDOW = { initialNumToRender: 6, maxToRenderPerBatch: 4, windowSize: 3 };

/**
 * The Personal Forest (docs/05 §3, docs/03 §13; M3.4): a timeline of months, not a gallery.
 * The landscape is drawn from the growing edge (the current month) back to the first month,
 * every quiet month included, with year markers; a list view lists the same months in the same
 * order for screen readers and quick lookup. Months, kinds, and order are the server's.
 */
export function ForestScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { query, items, summary, progression } = useForest();
  const [view, setView] = useState<'landscape' | 'list'>('landscape');

  const open = (item: ForestItem) => {
    if (item.kind === 'growing' && item === items?.[0]) {
      router.push('/tree');
      return;
    }
    router.push({
      pathname: '/month/[year]/[month]',
      params: { year: String(item.year), month: String(item.month) },
    });
  };
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) {
      void query.fetchNextPage();
    }
  };

  return (
    <Screen title="Forest">
      {summary ? (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          {forestSummaryText(summary)}
        </Text>
      ) : null}
      {items && items.every((item) => item.kind === 'growing') ? (
        // Before the first planted month: a clearing with this month's seed spot (docs/05).
        <EmptyState
          illustration="clearing"
          message="Your forest begins when this month's tree is planted."
          action={{ label: "See this month's tree", onPress: () => router.navigate('/') }}
        />
      ) : null}
      {items ? (
        <>
          <Button
            variant="tertiary"
            label={view === 'landscape' ? 'List view' : 'Landscape view'}
            onPress={() => setView(view === 'landscape' ? 'list' : 'landscape')}
          />
          {view === 'landscape' ? (
            <Landscape
              items={items}
              areas={progression?.unlockedAreas ?? []}
              onOpen={open}
              onEnd={loadMore}
            />
          ) : (
            <MonthList items={items} onOpen={open} />
          )}
          {query.isFetchNextPageError ? (
            <InlineStatus
              tone="attention"
              message="Earlier months couldn't load right now."
              action={{ label: 'Try again', onPress: () => void query.fetchNextPage() }}
            />
          ) : query.isFetchingNextPage ? (
            <SkeletonGroup label="Loading earlier months">
              <Skeleton variant="text" lines={1} />
            </SkeletonGroup>
          ) : view === 'list' && query.hasNextPage ? (
            <Button variant="secondary" label="Show earlier months" onPress={loadMore} />
          ) : null}
        </>
      ) : query.isError ? (
        <ErrorState
          illustration="clearing"
          message="We couldn't load your forest right now."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <SkeletonGroup label="Loading your forest">
          <Skeleton variant="block" />
        </SkeletonGroup>
      )}
    </Screen>
  );
}

/**
 * The calm landscape: one authored path along a ground band, trees placed in order with no
 * physics or map engine. The server's newest-first list is drawn inverted, so the growing edge
 * sits at the near end and earlier months load as the user pans back. Overview trees are still
 * thumbnails (no idle motion) and only a few are mounted at a time. The scenery (ground, an
 * unlocked lake) is decorative and hidden from screen readers; progression never changes a tree.
 */
function Landscape({
  items,
  areas,
  onOpen,
  onEnd,
}: {
  items: ForestItem[];
  areas: readonly string[];
  onOpen: (item: ForestItem) => void;
  onEnd: () => void;
}) {
  const theme = useTheme();
  return (
    <View>
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{
          position: 'absolute',
          left: theme.space[0],
          right: theme.space[0],
          bottom: theme.space[8],
          height: theme.space[10],
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.forest.soft,
        }}
      >
        {areas.includes('lake') ? (
          <View
            testID="forest-area-lake"
            style={{
              position: 'absolute',
              right: theme.space[4],
              bottom: theme.space[2],
              width: theme.space[16],
              height: theme.space[4],
              borderRadius: theme.radius.full,
              backgroundColor: theme.colors.surface.scene,
            }}
          />
        ) : null}
      </View>
      <FlatList
        testID="forest-landscape"
        horizontal
        inverted
        data={items}
        keyExtractor={monthKey}
        renderItem={({ item, index }) => (
          <LandscapeMonth
            item={item}
            yearStarts={items[index + 1]?.year !== item.year}
            onPress={() => onOpen(item)}
          />
        )}
        onEndReached={onEnd}
        onEndReachedThreshold={0.5}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.space[4], paddingHorizontal: theme.space[2] }}
        {...LANDSCAPE_WINDOW}
      />
    </View>
  );
}

function LandscapeMonth({
  item,
  yearStarts,
  onPress,
}: {
  item: ForestItem;
  /** The first month of its year among the loaded ones: a year marker stands before it. */
  yearStarts: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const caption = [theme.type.caption, { color: theme.colors.text.secondary }];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.space[3] }}>
      {yearStarts ? (
        <Text
          testID={`year-marker-${item.year}`}
          importantForAccessibility="no"
          style={[theme.type.label, { color: theme.colors.text.primary }]}
        >
          {String(item.year)}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={forestItemLabel(item)}
        onPress={onPress}
        style={{ alignItems: 'center', gap: theme.space[1] }}
      >
        {item.kind === 'resting' ? (
          <RestingMarker />
        ) : (
          <TreeScene
            tree={toTreeVisualState(item.tree)}
            size="thumbnail"
            motion="still"
            active={false}
          />
        )}
        <Text style={caption}>{item.kind === 'growing' ? 'Now' : shortMonth(item)}</Text>
      </Pressable>
    </View>
  );
}

/** A quiet month: a small mossy mound, never a dead or empty tree (docs/03 §2). */
export function RestingMarker() {
  const theme = useTheme();
  return (
    <View
      testID="resting-marker"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: theme.space[12],
        height: theme.space[6],
        marginTop: theme.space[10],
        borderTopLeftRadius: theme.radius.full,
        borderTopRightRadius: theme.radius.full,
        backgroundColor: theme.colors.forest.soft,
        borderWidth: theme.control.borderWidth,
        borderColor: theme.colors.forest.primary,
      }}
    />
  );
}

/** The same months in the same order, grouped by year: no landscape to navigate. */
function MonthList({ items, onOpen }: { items: ForestItem[]; onOpen: (item: ForestItem) => void }) {
  const theme = useTheme();
  return (
    <View testID="forest-list" style={{ gap: theme.space[4] }}>
      {groupByYear(items).map((group) => (
        <View key={`${group.year}-${monthKey(group.items[0]!)}`} style={{ gap: theme.space[1] }}>
          <Text
            accessibilityRole="header"
            style={[theme.type.headline, { color: theme.colors.text.primary }]}
          >
            {String(group.year)}
          </Text>
          {group.items.map((item) => (
            <ListRow
              key={monthKey(item)}
              title={monthTitle(item)}
              subtitle={forestItemLabel(item).slice(monthTitle(item).length + 2)}
              onPress={() => onOpen(item)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
