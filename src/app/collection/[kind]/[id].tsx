import { useLocalSearchParams } from 'expo-router';

import { CollectionItemScreen } from '../../../collection/CollectionItemScreen';

/** A Collection Book item's detail, by its kind and id (docs/05). */
export default function Route() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  return <CollectionItemScreen kind={String(kind ?? '')} id={String(id ?? '')} />;
}
