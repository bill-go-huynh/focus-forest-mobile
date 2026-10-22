import { Text, View } from 'react-native';

import { Chip } from '../components/Chip';
import { useTheme } from '../theme';
import { useSeason, useSetHemisphere } from './queries';
import { SectionCard } from '../components/SectionCard';

const HEMISPHERE = { north: 'Northern', south: 'Southern' } as const;

/**
 * Seasons in Settings (docs/03 §10: "October = autumn" is not universal): the hemisphere the
 * seasons follow, from the time zone by default or chosen by the user.
 */
export function SeasonSettings() {
  const theme = useTheme();
  const season = useSeason();
  const change = useSetHemisphere();
  if (!season.data) return null;
  const { hemisphere, hemisphereSource } = season.data;
  const source =
    hemisphereSource === 'set'
      ? 'chosen by you'
      : hemisphereSource === 'time_zone'
        ? 'from your time zone'
        : 'by default';
  const chosen = hemisphereSource === 'set' ? hemisphere : null;

  return (
    <SectionCard title="Seasons">
      <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
        {`${HEMISPHERE[hemisphere]} hemisphere, ${source}`}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        <Chip
          label="Automatic"
          selected={chosen === null}
          disabled={change.isPending}
          onPress={() => {
            if (chosen !== null) change.mutate(null);
          }}
        />
        {(['north', 'south'] as const).map((value) => (
          <Chip
            key={value}
            label={HEMISPHERE[value]}
            selected={chosen === value}
            disabled={change.isPending}
            onPress={() => {
              if (chosen !== value) change.mutate(value);
            }}
          />
        ))}
      </View>
    </SectionCard>
  );
}
