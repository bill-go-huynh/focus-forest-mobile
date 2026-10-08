import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useFontScale } from '../accessibility';
import { NetworkError, type CollectionItem } from '../api';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { InlineStatus } from '../components/InlineStatus';
import { ProgressBar } from '../components/ProgressBar';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { SPECIES_SCREEN_TITLE } from '../species/SpeciesScreen';
import { useTheme } from '../theme';
import { CollectionArt } from './CollectionArt';
import { equipPlace, equipSlotOf, hintOf, ownedLine } from './collection-format';
import { COLLECTION_TITLE } from './CollectionScreen';
import { useCollection, useEquip } from './queries';

/**
 * A Collection Book item's detail (docs/05: open an item's detail, and equip it for cosmetics):
 * its art, what it is, how it is held, or the server's honest hint while it is locked. An owned
 * cosmetic the app can draw can be used in its place (the garden, or the profile) and stopped;
 * online only, and shown as used only once the server answered.
 */
export function CollectionItemScreen({ kind, id }: { kind: string; id: string }) {
  const collection = useCollection();
  const item = collection.data?.sections
    .flatMap((section) => section.items)
    .find((candidate) => candidate.kind === kind && candidate.id === id);

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
  if (!item) {
    return (
      <Screen title={COLLECTION_TITLE}>
        <EmptyState illustration="clearing" message="This item isn’t in your collection." />
      </Screen>
    );
  }
  return <ItemDetail item={item} />;
}

function ItemDetail({ item }: { item: CollectionItem }) {
  const theme = useTheme();
  const router = useRouter();
  const held = ownedLine(item);
  const hint = hintOf(item);
  const secondary = [theme.type.body, { color: theme.colors.text.secondary }];
  const strong = [theme.type.bodyStrong, { color: theme.colors.text.primary }];

  return (
    <Screen title={item.name}>
      <View style={{ alignItems: 'center' }}>
        <CollectionArt item={item} />
      </View>
      <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>
        {item.description}
      </Text>
      {held ? <Text style={secondary}>{held}</Text> : null}
      {hint ? (
        <View style={{ gap: theme.space[2] }}>
          <Text style={secondary}>{hint.text}</Text>
          {hint.progress ? (
            <ProgressBar ratio={hint.ratio} label={hint.label} valueText={hint.progress} />
          ) : null}
        </View>
      ) : null}
      {item.kind === 'species' && item.owned ? (
        item.selected ? (
          <Text style={strong}>Growing this month</Text>
        ) : (
          <View style={{ alignItems: 'flex-start' }}>
            <Button
              variant="secondary"
              label={SPECIES_SCREEN_TITLE}
              onPress={() => router.push('/species')}
            />
          </View>
        )
      ) : null}
      {item.kind === 'badge' && item.owned && item.showcasePosition !== null ? (
        <Text style={strong}>On your showcase</Text>
      ) : null}
      <EquipControl item={item} />
    </Screen>
  );
}

function EquipControl({ item }: { item: CollectionItem }) {
  const theme = useTheme();
  const { isLargeText } = useFontScale();
  const equip = useEquip();
  const [status, setStatus] = useState<string | null>(null);
  const slot = equipSlotOf(item);
  if (!slot || item.kind !== 'cosmetic') return null;
  const place = equipPlace(slot);

  const change = (cosmeticId: string | null) => {
    setStatus(null);
    equip.mutate(
      { slot, cosmeticId },
      {
        onError: (error) =>
          setStatus(
            error instanceof NetworkError
              ? `Changing your ${place} needs a connection. Nothing was changed.`
              : "That can't be used right now.",
          ),
      },
    );
  };

  return (
    <View style={{ gap: theme.space[2], alignItems: isLargeText ? 'stretch' : 'flex-start' }}>
      {item.equipped ? (
        <>
          <Text style={[theme.type.bodyStrong, { color: theme.colors.text.primary }]}>
            {place === 'garden' ? 'In your garden' : 'On your profile'}
          </Text>
          <Button
            variant="secondary"
            label="Stop using"
            onPress={() => change(null)}
            disabled={equip.isPending}
            disabledReason="Saving your change."
          />
        </>
      ) : (
        <Button
          variant="primary"
          label={place === 'garden' ? 'Use in your garden' : 'Use on your profile'}
          onPress={() => change(item.id)}
          disabled={equip.isPending}
          disabledReason="Saving your change."
        />
      )}
      {status ? <InlineStatus tone="attention" message={status} live /> : null}
    </View>
  );
}
