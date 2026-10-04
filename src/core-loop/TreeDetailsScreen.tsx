import { useMemo } from 'react';
import { Text, View } from 'react-native';

import type { CurrentTreeResponse, Topic, TreeStateResponse } from '../api';
import { ErrorState } from '../components/ErrorState';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { StartFocus } from '../focus/StartFocus';
import { formatFocused } from '../history/history-format';
import { useTheme } from '../theme';
import { useTopics } from '../topics/queries';
import { useTopicIdentity } from '../topics/topic-create-sync';
import { toTreeVisualState, TreeScene } from '../tree';
import { traitLook } from '../tree/signature/trait-decorations';
import { knownTrait } from '../tree/visual-state';
import { stageHint } from './presentation';
import { useCurrentTree, useHome } from './queries';
import { useSceneTimeOfDay } from './use-scene-time';

const MINUTE = 60_000;

/**
 * Tree Details for the current month (docs/03 §12, docs/05): the tree large, the month and
 * stage, this month's stats (GET /me/trees/current), the current streak (from Home), the top
 * topic, and the earned milestone details in words, then a secondary Start Focus (the same
 * entry as Home's). Offline it shows the last saved tree and no numbers. Archived months arrive
 * with the Forest (M3.4).
 */
export function TreeDetailsScreen() {
  const theme = useTheme();
  const current = useCurrentTree();
  const { home } = useHome();
  const timeOfDay = useSceneTimeOfDay();
  const treeState: TreeStateResponse | null = current.data?.tree ?? home?.tree ?? null;
  const tree = useMemo(() => (treeState ? toTreeVisualState(treeState) : null), [treeState]);

  if (!tree || !treeState) {
    return (
      <Screen>
        {current.isPending ? (
          <SkeletonGroup label="Loading your tree">
            <Skeleton variant="block" />
          </SkeletonGroup>
        ) : (
          <ErrorState
            illustration="seed-in-soil"
            message="We couldn't load your tree right now."
            onRetry={() => void current.refetch()}
          />
        )}
      </Screen>
    );
  }

  const month = new Date(Date.UTC(treeState.year, treeState.month - 1, 1)).toLocaleDateString(
    undefined,
    { month: 'long', year: 'numeric', timeZone: 'UTC' },
  );
  const body = [theme.type.body, { color: theme.colors.text.primary }];

  return (
    <Screen title={month}>
      <TreeScene tree={tree} timeOfDay={timeOfDay} />
      <Text style={[theme.type.headline, { color: theme.colors.text.primary }]}>
        {stageHint(treeState.progress.stage, treeState.progress.progressToNextStage)}
      </Text>

      {current.data ? (
        <MonthStats
          stats={current.data.stats}
          streak={home?.streak.current ?? null}
          recentTopics={home?.recentTopics ?? []}
        />
      ) : (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          {"This month's numbers load when you're online."}
        </Text>
      )}

      <View style={{ gap: theme.space[2] }}>
        <Text
          accessibilityRole="header"
          style={[theme.type.headline, { color: theme.colors.text.primary }]}
        >
          Milestones
        </Text>
        <TraitList ids={treeState.traits.map((trait) => trait.id)} style={body} />
      </View>

      <StartFocus variant="secondary" />
    </Screen>
  );
}

function MonthStats({
  stats,
  streak,
  recentTopics,
}: {
  stats: CurrentTreeResponse['stats'];
  streak: number | null;
  recentTopics: readonly Topic[];
}) {
  const theme = useTheme();
  const topTopic = useTopTopicName(stats.topTopicId, recentTopics);
  const body = [theme.type.body, { color: theme.colors.text.primary }];
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.primary }]}
      >
        This month
      </Text>
      <Text style={body}>{`${formatFocused(stats.focusedMinutes * MINUTE)} focused`}</Text>
      <Text style={body}>{plural(stats.sessionCount, 'session')}</Text>
      <Text style={body}>{plural(stats.activeDays, 'active day')}</Text>
      <Text style={body}>{`Daily goals met: ${stats.dailyGoalsMet}`}</Text>
      <Text style={body}>{`Weekly goals met: ${stats.weeklyGoalsMet}`}</Text>
      {streak !== null ? (
        <Text style={body}>{`Current streak: ${plural(streak, 'day')}`}</Text>
      ) : null}
      {topTopic !== null ? <Text style={body}>{`Top topic: ${topTopic}`}</Text> : null}
    </View>
  );
}

/**
 * The top topic's name, always by its id: as Home listed it, else as the device knows it
 * (saved lists include archived topics), else from the server's list of every topic, asked
 * only then. Never the raw id, never another topic: while unknown it says so neutrally.
 */
function useTopTopicName(topicId: string | null, recentTopics: readonly Topic[]): string | null {
  const recent = recentTopics.find((entry) => entry.id === topicId);
  const known = useTopicIdentity(topicId ?? '');
  const name = topicId === null ? null : (recent?.name ?? known?.name ?? null);
  const all = useTopics({}, { enabled: topicId !== null && name === null });
  if (topicId === null) return null;
  if (name !== null) return name;
  return all.isFetching ? 'loading' : 'name not available right now';
}

/** Each milestone detail the renderer can name; the others are counted, never dropped. */
function TraitList({ ids, style }: { ids: string[]; style: object[] }) {
  const named = ids.flatMap((id) => {
    const trait = knownTrait(id);
    const look = trait ? traitLook(trait) : null;
    if (!trait || !look) return [];
    const milestone =
      trait.family === 'streak-days'
        ? `your ${trait.value}-day streak`
        : `${trait.value} focus hours`;
    return [
      { id, text: `${look.name.charAt(0).toUpperCase()}${look.name.slice(1)} for ${milestone}` },
    ];
  });
  const more = new Set(ids).size - named.length;
  if (named.length === 0 && more === 0) {
    return <Text style={style}>Milestones you reach this month appear here.</Text>;
  }
  return (
    <>
      {named.map((entry) => (
        <Text key={entry.id} style={style}>
          {entry.text}
        </Text>
      ))}
      {more > 0 ? (
        <Text
          style={style}
        >{`${more} ${named.length > 0 ? 'more ' : ''}milestone detail${more === 1 ? '' : 's'}`}</Text>
      ) : null}
    </>
  );
}
