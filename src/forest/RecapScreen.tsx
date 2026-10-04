import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import type { MonthRef, Recap } from '../api';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useTheme } from '../theme';
import { toTreeVisualState, TreeScene } from '../tree';
import { monthTitle } from './forest-format';
import { useMarkRecapSeen, useRecap } from './queries';
import { RecapSharePage } from './RecapSharePage';
import { recapPages, type RecapPage } from './recap-format';

/**
 * The monthly recap (docs/05 → Monthly recap; M3.4), full screen, from the snapshot stored at
 * archive: paged, one idea per page, Next to move on, and on the last page Share and Go to
 * Forest. The recap is marked seen once it is on screen (not when only its data was loaded);
 * that mark is separate from the month-end ceremony.
 */
export function RecapScreen({ month }: { month: MonthRef }) {
  const recap = useRecap(month);
  const markSeen = useMarkRecapSeen();
  const marked = useRef(false);
  const shown = recap.data !== undefined;

  useEffect(() => {
    if (!shown || marked.current) return;
    marked.current = true;
    markSeen.mutate(month);
  }, [shown, markSeen, month]);

  if (recap.data) return <RecapPages recap={recap.data} />;
  return (
    <Screen title={monthTitle(month)}>
      {recap.isError ? (
        <ErrorState
          illustration="clearing"
          message="We couldn't load this recap right now."
          onRetry={() => void recap.refetch()}
        />
      ) : (
        <SkeletonGroup label="Loading your recap">
          <Skeleton variant="block" />
        </SkeletonGroup>
      )}
    </Screen>
  );
}

function RecapPages({ recap }: { recap: Recap }) {
  const theme = useTheme();
  const router = useRouter();
  const pages = useMemo(() => recapPages(recap), [recap]);
  const [index, setIndex] = useState(0);
  const page = pages[Math.min(index, pages.length - 1)]!;
  const last = index >= pages.length - 1;

  return (
    <Screen title={index === 0 ? monthTitle(recap) : undefined}>
      <PageContent page={page} recap={recap} />
      <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>
        {`Page ${index + 1} of ${pages.length}`}
      </Text>
      <View style={{ gap: theme.space[3] }}>
        {!last ? (
          <Button variant="primary" label="Next" onPress={() => setIndex(index + 1)} />
        ) : (
          <Button
            variant="secondary"
            label="Go to Forest"
            onPress={() => router.navigate('/forest')}
          />
        )}
        {index > 0 ? (
          <Button variant="tertiary" label="Back" onPress={() => setIndex(index - 1)} />
        ) : null}
        <Button variant="tertiary" label="Close" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function Hero({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.secondary }]}
      >
        {label}
      </Text>
      <Text style={[theme.type.title, { color: theme.colors.text.primary }]}>{value}</Text>
    </View>
  );
}

function PageContent({ page, recap }: { page: RecapPage; recap: Recap }) {
  const theme = useTheme();
  const tree = useMemo(() => toTreeVisualState(recap.tree), [recap.tree]);
  const body = [theme.type.body, { color: theme.colors.text.primary }];
  switch (page.kind) {
    case 'cover':
      return (
        <>
          <TreeScene tree={tree} />
          <Text style={body}>Your month in focus.</Text>
        </>
      );
    case 'focus':
      return <Hero label="Total focus" value={page.value} />;
    case 'sessions':
      return <Hero label="Sessions and active days" value={page.value} />;
    case 'topTopic':
      return <Hero label="Top topic" value={page.value} />;
    case 'streak':
      return <Hero label="Longest streak" value={page.value} />;
    case 'bestDay':
      return <Hero label="Your best day" value={page.value} />;
    case 'bestWeek':
      return <Hero label="Your best week" value={page.value} />;
    case 'records':
      return (
        <View style={{ gap: theme.space[2] }}>
          <Text
            accessibilityRole="header"
            style={[theme.type.headline, { color: theme.colors.text.secondary }]}
          >
            New personal records
          </Text>
          {page.lines.map((line) => (
            <Text key={line} style={body}>
              {line}
            </Text>
          ))}
        </View>
      );
    case 'notes':
      // Private: shown here to the owner, never put on a shared card.
      return (
        <View style={{ gap: theme.space[2] }}>
          <Text
            accessibilityRole="header"
            style={[theme.type.headline, { color: theme.colors.text.secondary }]}
          >
            {page.notes.length === 1 ? 'Highlighted note' : 'Highlighted notes'}
          </Text>
          {page.notes.map((note) => (
            <Text key={note.sessionId} style={body}>
              {note.note}
            </Text>
          ))}
        </View>
      );
    case 'share':
      return <RecapSharePage recap={recap} />;
  }
}
