import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme';

/**
 * A tab or stack screen: background, safe-area top, the screen gutter, an optional
 * heading, and scrolling so content stays reachable at 200% text (docs/11).
 */
export interface ScreenProps {
  /** Shown as the screen's heading. Omit it when a stack header already names the screen. */
  title?: string;
  children: ReactNode;
  /** Pad for the status bar. Off under a stack header, which already does. */
  safeTop?: boolean;
}

export function Screen({ title, children, safeTop = true }: ScreenProps) {
  const theme = useTheme();
  const { top } = useSafeAreaInsets();
  return (
    <View testID="screen" style={{ flex: 1, backgroundColor: theme.colors.background.primary }}>
      <ScrollView
        testID="screen-scroll"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          paddingTop: (safeTop ? top : theme.space[0]) + theme.space[5],
          paddingHorizontal: theme.space[5],
          paddingBottom: theme.space[8],
          gap: theme.space[6],
        }}
      >
        {title ? (
          <Text
            accessibilityRole="header"
            style={[theme.type.title, { color: theme.colors.text.primary }]}
          >
            {title}
          </Text>
        ) : null}
        {children}
      </ScrollView>
    </View>
  );
}
