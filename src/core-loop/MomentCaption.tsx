import { Text, View } from 'react-native';

import { useTheme } from '../theme';
import type { GrowthMoment } from './presentation';

/**
 * The growth moment in words (docs/04 §5 → "Name the moment"): the caption in the display
 * style, and the other changes in one line. The scene's reaction never carries the meaning
 * alone, so this shows with or without motion.
 */
export function MomentCaption({ moment }: { moment: GrowthMoment }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[1] }}>
      <Text style={[theme.type.headline, { color: theme.colors.text.primary }]}>
        {moment.caption}
      </Text>
      {moment.others.length > 0 ? (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          {`Also: ${moment.others.join(' ')}`}
        </Text>
      ) : null}
    </View>
  );
}
