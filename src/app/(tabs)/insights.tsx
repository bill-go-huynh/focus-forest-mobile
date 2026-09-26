import { useRouter } from 'expo-router';

import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';

/** Insights, before any session (docs/01 §9: an opportunity, not an apology). */
export default function InsightsScreen() {
  const router = useRouter();
  return (
    <Screen title="Insights">
      <EmptyState
        illustration="lantern"
        message="Your focus story begins with your first session."
        action={{ label: 'Go to your tree', onPress: () => router.navigate('/') }}
      />
    </Screen>
  );
}
