import { Text, View } from 'react-native';

import { ListRow } from '../components/ListRow';
import { SectionCard } from '../components/SectionCard';
import { useTheme } from '../theme';
import { BadgeMark } from './BadgeMark';
import { useBadges } from './queries';

/**
 * Profile's badge showcase and the way to Achievements (docs/05 §3), from GET /me/badges. Badges
 * are introduced when they become relevant (docs/02): nothing shows until the user owns one.
 * Secondary on Profile, so a failed read simply leaves it out; Achievements says more.
 */
export function ProfileShowcase({ onOpen }: { onOpen: () => void }) {
  const theme = useTheme();
  const { data } = useBadges();
  if (!data || data.items.length === 0) return null;
  return (
    <SectionCard title="Badges">
      {data.showcase.length > 0 ? (
        <View
          testID="profile-showcase"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[4] }}
        >
          {data.showcase.map((badge) => (
            <View key={badge.id} style={{ alignItems: 'center', gap: theme.space[1] }}>
              <BadgeMark badge={badge} />
              <Text
                accessibilityRole="text"
                style={[theme.type.caption, { color: theme.colors.text.secondary }]}
              >
                {badge.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <ListRow
        title="Achievements"
        onPress={onOpen}
        accessibilityHint="Opens your badges, your showcase, and achievements in progress."
      />
    </SectionCard>
  );
}
