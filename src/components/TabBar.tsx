import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET } from '../accessibility';
import { useTheme } from '../theme';
import { TAB_ICON_NAMES, TabIcon, type TabIconName } from './icons';

/**
 * The bottom tab bar (docs/01 §8 → Bottom navigation): line icon plus short label, the
 * active tab filled and in text.primary, inactive tabs in text.muted. Screen readers hear
 * a tab list with the selected tab marked.
 */
export type TabBarProps = BottomTabBarProps;

const isTabIcon = (name: string): name is TabIconName =>
  (TAB_ICON_NAMES as readonly string[]).includes(name);

export function TabBar({ state, descriptors, navigation, insets }: TabBarProps) {
  const theme = useTheme();
  const { colors, space } = theme;

  return (
    // Not `accessible`: grouping would hide the individual tabs from screen readers.
    <View
      testID="tab-bar"
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface.primary,
        borderTopColor: colors.border.subtle,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingTop: space[1],
        paddingBottom: insets.bottom,
      }}
    >
      {state.routes.map((route, index) => {
        const selected = state.index === index;
        const label = descriptors[route.key]?.options.title ?? route.name;
        const color = selected ? colors.text.primary : colors.text.muted;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!selected && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={onPress}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH_TARGET,
              minWidth: MIN_TOUCH_TARGET,
              alignItems: 'center',
              justifyContent: 'center',
              gap: space[1],
              paddingVertical: space[2],
            }}
          >
            {isTabIcon(route.name) ? (
              <TabIcon name={route.name} filled={selected} color={color} size={theme.icon.md} />
            ) : null}
            {/* No numberOfLines: at large text sizes the label wraps and the bar grows. */}
            <Text style={[theme.type.label, { color, textAlign: 'center' }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
