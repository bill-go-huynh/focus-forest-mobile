import { Text, View } from 'react-native';

import { MIN_TOUCH_TARGET } from '../accessibility';
import { useTheme, type Theme } from '../theme';
import { PressableSurface, requireText, type IconRenderer } from './PressableSurface';

/** Chip primitive for topic selection, filters, and presets (docs/01_DESIGN_SYSTEM.md §8). */

export type TopicColorKey = keyof Theme['colors']['topic'];

export interface ChipProps {
  /** Always shown, and the accessible name: a topic is never identified by color alone. */
  label: string;
  selected: boolean;
  onPress: () => void;
  /** A curated topic color (topic.1–topic.12), shown as a dot beside the label. */
  topicColor?: TopicColorKey;
  /** The topic or filter icon, drawn with the color and size the chip provides. */
  icon?: IconRenderer;
  disabled?: boolean;
  disabledReason?: string;
  accessibilityHint?: string;
  /** A fuller accessible name that contains what the label says (e.g. "Start Reading, 25 minutes"). */
  accessibilityLabel?: string;
  testID?: string;
}

export function Chip({
  label,
  selected,
  topicColor,
  icon,
  accessibilityLabel,
  ...rest
}: ChipProps) {
  const theme = useTheme();
  const { colors, space } = theme;
  requireText(label, 'label', 'Chip');

  return (
    <PressableSurface
      accessibilityLabel={accessibilityLabel ?? label}
      selected={selected}
      layout={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
        minHeight: MIN_TOUCH_TARGET,
        minWidth: MIN_TOUCH_TARGET,
        paddingHorizontal: space[4],
        paddingVertical: space[2],
        borderRadius: theme.radius.full,
        // Selection shows as an outline as well as a fill; the border is always present
        // so selecting never shifts the layout.
        borderWidth: theme.control.borderWidth,
        borderColor: selected ? colors.accent.primary : colors.surface.sunken,
      }}
      fill={
        selected
          ? { rest: colors.accent.soft, pressed: colors.accent.soft }
          : { rest: colors.surface.sunken, pressed: colors.background.secondary }
      }
      {...rest}
    >
      {topicColor !== undefined || icon ? (
        // The label names the chip; the dot and icon are decorative for screen readers.
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}
        >
          {topicColor !== undefined ? (
            <View
              testID="chip-topic-dot"
              style={{
                width: space[3],
                height: space[3],
                borderRadius: theme.radius.full,
                backgroundColor: colors.topic[topicColor],
              }}
            />
          ) : null}
          {icon?.({ color: colors.text.primary, size: theme.icon.sm })}
        </View>
      ) : null}
      {/* No numberOfLines: long labels wrap at large text sizes instead of truncating. */}
      <Text style={[theme.type.label, { color: colors.text.primary, flexShrink: 1 }]}>{label}</Text>
    </PressableSurface>
  );
}
