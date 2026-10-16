import { useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { HttpError, type CommunityTree } from '../api';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Modal } from '../components/Modal';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useTheme } from '../theme';
import type { TreeStage } from '../tree/tree-contract';
import { TreeScene } from '../tree/TreeScene';
import { toTreeVisualState, type TreeVisualState } from '../tree/visual-state';
import { groupedNumber, stageName } from './event-format';
import { useCommunityCelebrated, useCommunityTree } from './queries';

/** The community stages on the same stage framework and renderer (docs/03 §10). */
const SCENE_STAGE: Record<string, { stage: TreeStage; number: number; level: number }> = {
  seedling: { stage: 'sprout', number: 2, level: 1 },
  growing_tree: { stage: 'growing_tree', number: 4, level: 3 },
  bloom: { stage: 'blooming_tree', number: 6, level: 5 },
  final_form: { stage: 'final_form', number: 7, level: 5 },
};

/** A stable seed from the event id, so the shared tree looks the same on every device. */
function seedOf(id: string): number {
  let hash = 2_166_136_261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16_777_619);
  return hash >>> 0;
}

/**
 * The shared tree drawn by the personal tree's renderer: its stage from the community's reached
 * milestone. PROVISIONAL art (ART.5): the Community Tree is drawn as the signature species in
 * direction B, on the same renderer, until the owner wants a species of its own (docs/10).
 */
function sceneTree(tree: CommunityTree): TreeVisualState {
  const look = (tree.stage && SCENE_STAGE[tree.stage]) || { stage: 'seed', number: 1, level: 0 };
  const now = new Date();
  return toTreeVisualState({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    status: 'growing',
    species: 'signature',
    variationSeed: seedOf(tree.eventId),
    partialFirstMonth: false,
    configVersion: 1,
    progress: {
      stage: look.stage,
      stageNumber: look.number,
      progressToNextStage: null,
      growthMinutes: tree.totalMinutes,
      fullness: { level: look.level, maxLevel: 5 },
      blossoms: { level: look.level, maxLevel: 7 },
      richness: { tier: 0, maxTier: 5 },
    },
    traits: [],
    vitality: 'thriving',
  });
}

/**
 * The Community Tree (docs/05: its own screen; docs/01: a warm shared number rather than a race;
 * docs/02: it never singles out low contributors). Each milestone's celebration shows once, then
 * is marked seen (docs/04: shown once per user on their next open).
 */
export function CommunityTreeScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const tree = useCommunityTree(eventId);
  if (tree.isPending) {
    return (
      <Screen safeTop={false}>
        <SkeletonGroup label="Loading the Community Tree">
          <Skeleton variant="text" lines={4} />
        </SkeletonGroup>
      </Screen>
    );
  }
  if (tree.isError) {
    if (tree.error instanceof HttpError && tree.error.status === 404) {
      return (
        <Screen safeTop={false}>
          <EmptyState illustration="clearing" message="This event has no Community Tree." />
        </Screen>
      );
    }
    return (
      <Screen safeTop={false}>
        <ErrorState
          message="We couldn't load the Community Tree right now."
          onRetry={() => void tree.refetch()}
        />
      </Screen>
    );
  }
  return <CommunityView tree={tree.data} />;
}

function CommunityView({ tree }: { tree: CommunityTree }) {
  const theme = useTheme();
  const celebrated = useCommunityCelebrated(tree.eventId);
  const scene = useMemo(() => sceneTree(tree), [tree]);
  // The highest stage still to celebrate, named; every one listed is marked seen together.
  const order = tree.milestones.map((milestone) => milestone.stage);
  const toCelebrate = [...tree.celebrate].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const highest = toCelebrate.at(-1) ?? null;

  return (
    <Screen title={tree.name} safeTop={false}>
      <TreeScene tree={scene} testID="community-tree-scene" />
      <Body>
        {`${groupedNumber(tree.totalMinutes)} minutes grown together by ${groupedNumber(tree.participants)} ${tree.participants === 1 ? 'person' : 'people'}`}
      </Body>
      <Muted>
        {tree.stage ? `Now in ${stageName(tree.stage)}` : 'A seed, waiting for the first minutes'}
      </Muted>
      {tree.yourMinutes !== null ? (
        <Muted>{`You added ${groupedNumber(tree.yourMinutes)} minutes`}</Muted>
      ) : null}

      <View style={{ gap: theme.space[1] }}>
        <Text
          accessibilityRole="header"
          style={[theme.type.headline, { color: theme.colors.text.primary }]}
        >
          Milestones
        </Text>
        {tree.milestones.map((milestone) => (
          <Body key={milestone.stage}>
            {`${stageName(milestone.stage)} · ${groupedNumber(milestone.thresholdMinutes)} minutes${milestone.reached ? ' · Reached' : ''}`}
          </Body>
        ))}
      </View>

      <Modal
        visible={highest !== null}
        title={
          highest ? `The Community Tree reached ${stageName(highest)}` : 'The Community Tree grew'
        }
        message="Everyone's focus grew it together. Your share of the reward is in your collection."
        onRequestClose={() => celebrated.mutate(toCelebrate)}
      >
        <Button
          variant="primary"
          label="Continue"
          disabled={celebrated.isPending}
          onPress={() => celebrated.mutate(toCelebrate)}
        />
      </Modal>
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
