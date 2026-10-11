import { Text, View } from 'react-native';

import { useTheme } from '../theme';
import { useSeason } from './queries';

/**
 * The season's limited collection in the Collection Book (spec §17.3): each reward with honest
 * progress from normal focus, or "In your collection" once earned (owned forever). Information,
 * never urgency (docs/02). Nothing outside a season.
 */
export function SeasonCollection() {
  const theme = useTheme();
  const season = useSeason();
  const data = season.data;
  if (!data?.theme || data.rewards.length === 0) return null;
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.primary }]}
      >
        {`This season: ${data.theme.name}`}
      </Text>
      <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
        {data.theme.description}
      </Text>
      {data.rewards.map((reward) => (
        <Text key={reward.id} style={[theme.type.body, { color: theme.colors.text.primary }]}>
          {reward.owned
            ? `${reward.item.name} · In your collection`
            : `${reward.item.name} · ${Math.min(reward.activeDays, reward.requiredActiveDays)} of ${reward.requiredActiveDays} days with focus`}
        </Text>
      ))}
    </View>
  );
}
