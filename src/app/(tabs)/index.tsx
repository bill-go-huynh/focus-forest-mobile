import { View, useWindowDimensions } from 'react-native';

import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../theme';

/**
 * Home, Phase 1 shell (docs/05 §3). The tree scene holds the hero space the monthly tree
 * takes in Phase 3; Start Focus arrives with the timer in Phase 2.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  return (
    <Screen title="This month">
      <View
        testID="home-hero"
        style={{
          // The tree takes roughly the upper 55–65% of Home (docs/05 §3).
          minHeight: height * 0.55,
          justifyContent: 'center',
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.surface.scene,
        }}
      >
        <EmptyState
          illustration="seed-in-soil"
          message="Your first session will plant this month's seed."
        />
      </View>
    </Screen>
  );
}
