import { useRouter } from 'expo-router';

import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';

/** Forest, before the first archived tree (docs/05 §3 → Personal forest, empty state). */
export default function ForestScreen() {
  const router = useRouter();
  return (
    <Screen title="Forest">
      <EmptyState
        illustration="clearing"
        message="Your forest begins when this month's tree is planted."
        action={{ label: "See this month's tree", onPress: () => router.navigate('/') }}
      />
    </Screen>
  );
}
