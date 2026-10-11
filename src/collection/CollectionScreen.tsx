import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import type { CollectionItem, CollectionSection } from '../api';
import { ErrorState } from '../components/ErrorState';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { SeasonCollection } from '../seasons/SeasonCollection';
import { useTheme } from '../theme';
import { CollectionArt, useArtSize } from './CollectionArt';
import { itemLabel, sectionCount, sectionTitle } from './collection-format';
import { useCollection } from './queries';

export const COLLECTION_TITLE = 'Collection Book';

/**
 * The Collection Book (docs/05 → Collection book, docs/02: a naturalist's journal): the
 * server's sections in its order, each a uniform grid of the same kind of item, owned items in
 * their art and locked ones as quiet silhouettes. A count per section, never a percentage.
 * Opening an item shows its detail (and, for a cosmetic, where it can be used).
 */
export function CollectionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const collection = useCollection();

  if (!collection.data) {
    return (
      <Screen title={COLLECTION_TITLE}>
        {collection.isError ? (
          <ErrorState
            message="We couldn't load your collection right now."
            onRetry={() => void collection.refetch()}
          />
        ) : (
          <SkeletonGroup label="Loading your collection">
            <Skeleton variant="text" lines={3} />
          </SkeletonGroup>
        )}
      </Screen>
    );
  }

  const open = (item: CollectionItem) =>
    router.push({ pathname: '/collection/[kind]/[id]', params: { kind: item.kind, id: item.id } });

  return (
    <Screen title={COLLECTION_TITLE}>
      <SeasonCollection />
      {collection.data.sections.map((section) => (
        <View key={section.kind} style={{ gap: theme.space[3] }}>
          <View style={{ gap: theme.space[1] }}>
            <Text
              accessibilityRole="header"
              style={[theme.type.headline, { color: theme.colors.text.primary }]}
            >
              {sectionTitle(section.kind)}
            </Text>
            <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>
              {sectionCount(section)}
            </Text>
          </View>
          <Grid section={section} onOpen={open} />
        </View>
      ))}
    </Screen>
  );
}

function Grid({
  section,
  onOpen,
}: {
  section: CollectionSection;
  onOpen: (item: CollectionItem) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[4] }}>
      {section.items.map((item) => (
        <Cell key={`${item.kind}-${item.id}`} item={item} onPress={() => onOpen(item)} />
      ))}
    </View>
  );
}

function Cell({ item, onPress }: { item: CollectionItem; onPress: () => void }) {
  const theme = useTheme();
  const { width } = useArtSize(item.kind);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={itemLabel(item)}
      onPress={onPress}
      style={{
        width: Math.max(width, theme.treeScene.thumbnail),
        minHeight: theme.control.minHeight,
        alignItems: 'center',
        gap: theme.space[1],
      }}
    >
      <CollectionArt item={item} />
      <Text
        numberOfLines={2}
        style={[
          theme.type.caption,
          {
            textAlign: 'center',
            color: item.owned ? theme.colors.text.primary : theme.colors.text.secondary,
          },
        ]}
      >
        {item.name}
      </Text>
    </Pressable>
  );
}
