import { useState } from 'react';
import { Text, View } from 'react-native';

import { useFontScale } from '../accessibility';
import { NetworkError, progressionErrorCode, type OwnedSpecies } from '../api';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ErrorState } from '../components/ErrorState';
import { InlineStatus } from '../components/InlineStatus';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { useTheme } from '../theme';
import { speciesPreview, TreeScene } from '../tree';
import { useSelectSpecies, useSpecies } from './queries';
import { speciesName, withArticle } from './species-format';

export const SPECIES_SCREEN_TITLE = "Choose this month's tree";

type Status = { tone: 'neutral' | 'attention'; message: string } | null;

/**
 * Species choice (docs/05 → Species choice, docs/03 §9): the owned species, each previewed as a
 * seed and at Final Form by the renderer, the month's species marked. Choosing is optional and
 * open only while the server says so (the month's tree is still a Seed); it never stands
 * between the user and focus. Once the tree grew, the month's species is named, read-only.
 */
export function SpeciesScreen() {
  const theme = useTheme();
  const species = useSpecies();
  const select = useSelectSpecies();
  const [status, setStatus] = useState<Status>(null);

  if (species.isError && !species.data) {
    return (
      <Screen title={SPECIES_SCREEN_TITLE}>
        <ErrorState
          message="We couldn't load your trees right now."
          onRetry={() => void species.refetch()}
        />
      </Screen>
    );
  }
  if (!species.data) {
    return (
      <Screen title={SPECIES_SCREEN_TITLE}>
        <SkeletonGroup label="Loading your trees">
          <Skeleton variant="text" lines={3} />
        </SkeletonGroup>
      </Screen>
    );
  }

  const list = species.data;
  const { current } = list;
  const choose = (item: OwnedSpecies) => {
    setStatus(null);
    select.mutate(item.id, {
      onSuccess: () =>
        setStatus({
          tone: 'neutral',
          message: `This month's tree is ${withArticle(item.name)}.`,
        }),
      onError: (error) =>
        setStatus({
          tone: 'attention',
          message:
            error instanceof NetworkError
              ? 'Choosing a species needs a connection. Nothing was changed.'
              : progressionErrorCode(error) === 'species_locked'
                ? "This month's tree has already started growing. You can choose again next month."
                : "That tree can't be chosen right now.",
        }),
    });
  };

  return (
    <Screen title={SPECIES_SCREEN_TITLE}>
      {current.locked ? (
        <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>
          {`This month's tree is growing as ${withArticle(speciesName(list, current.speciesId))}. You can choose again next month.`}
        </Text>
      ) : (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          Choosing is optional. Your tree grows the same way in every species.
        </Text>
      )}
      {status ? <InlineStatus tone={status.tone} message={status.message} live /> : null}
      {list.items.map((item) => (
        <SpeciesCard
          key={item.id}
          item={item}
          current={item.id === current.speciesId}
          open={!current.locked}
          busy={select.isPending}
          onChoose={() => choose(item)}
        />
      ))}
    </Screen>
  );
}

function SpeciesCard({
  item,
  current,
  open,
  busy,
  onChoose,
}: {
  item: OwnedSpecies;
  current: boolean;
  open: boolean;
  busy: boolean;
  onChoose: () => void;
}) {
  const theme = useTheme();
  const { isLargeText } = useFontScale();
  return (
    <Card>
      <View style={{ gap: theme.space[3] }}>
        {/* Examples of the species, not the user's tree: the name beside them is what is read. */}
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{ flexDirection: 'row', gap: theme.space[3] }}
        >
          <TreeScene
            tree={speciesPreview(item.id, 'seed')}
            size="thumbnail"
            motion="still"
            active={false}
          />
          <TreeScene
            tree={speciesPreview(item.id, 'final_form')}
            size="thumbnail"
            motion="still"
            active={false}
          />
        </View>
        <Text
          accessibilityRole="header"
          style={[theme.type.headline, { color: theme.colors.text.primary }]}
        >
          {item.name}
        </Text>
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          {item.description}
        </Text>
        {current ? (
          <Text style={[theme.type.bodyStrong, { color: theme.colors.text.primary }]}>
            Growing this month
          </Text>
        ) : open && item.selectable ? (
          <View style={{ alignItems: isLargeText ? 'stretch' : 'flex-start' }}>
            <Button
              variant="secondary"
              label="Choose"
              accessibilityLabel={`Choose ${item.name}`}
              onPress={onChoose}
              disabled={busy}
              disabledReason="Choosing your tree."
            />
          </View>
        ) : open ? (
          <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>
            {"This tree can't be chosen right now. It stays in your collection."}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
