import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../theme';
import { Card } from './Card';

/**
 * One section of a screen, held in a card (owner, 2026-10-22: sections that are not grouped read
 * as one long, loose list). A heading, then its content; an optional `footer` (a "See all" or a
 * second action) closes it. One card per idea (docs/01 §8 → Cards), never a stat-card grid.
 */
export function SectionCard({
  title,
  children,
  footer,
  testID,
}: {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Card testID={testID}>
      <View style={{ gap: theme.space[3] }}>
        {title ? (
          <Text
            accessibilityRole="header"
            style={[theme.type.headline, { color: theme.colors.text.primary }]}
          >
            {title}
          </Text>
        ) : null}
        {children}
        {footer ?? null}
      </View>
    </Card>
  );
}
