import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useForest } from '../forest/queries';
import { useTheme } from '../theme';
import { toTreeVisualState, TreeScene } from '../tree';

/** How many recent trees the vignette holds. */
const VIGNETTE_TREES = 3;

/**
 * Profile's small forest vignette (docs/05 §3 → Profile: "the user's identity, with a small
 * forest vignette (recent trees)"): the most recent archived trees from the forest's first
 * page, newest first, as still thumbnails; it opens the Forest. It appears only once a tree was
 * archived (docs/05: only when its phase produces real data), and a failed read leaves it out.
 */
export function ForestVignette() {
  const theme = useTheme();
  const router = useRouter();
  const { items } = useForest();
  const trees = (items ?? [])
    .flatMap((item) => (item.kind === 'archived' ? [item] : []))
    .slice(0, VIGNETTE_TREES);
  if (trees.length === 0) return null;
  return (
    <Pressable
      testID="profile-forest"
      accessibilityRole="button"
      accessibilityLabel={`Your forest, ${trees.length} recent ${trees.length === 1 ? 'tree' : 'trees'}`}
      accessibilityHint="Opens your forest."
      onPress={() => router.navigate('/forest')}
      style={{
        flexDirection: 'row',
        justifyContent: 'center',
        gap: theme.space[2],
        padding: theme.space[3],
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.forest.soft,
      }}
    >
      {trees.map((item) => (
        <View
          key={`${item.year}-${item.month}`}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <TreeScene
            tree={toTreeVisualState(item.tree)}
            size="thumbnail"
            motion="still"
            active={false}
          />
        </View>
      ))}
    </Pressable>
  );
}
