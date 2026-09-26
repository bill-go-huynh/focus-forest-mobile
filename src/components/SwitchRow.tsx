import { Pressable, Switch, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET } from '../accessibility';
import { useTheme } from '../theme';
import { requireText } from './PressableSurface';

/**
 * A setting with an on/off switch. The whole row is one accessible switch, named by its
 * label, with its state read aloud; pressing anywhere on it toggles.
 */
export interface SwitchRowProps {
  label: string;
  /** Shown under the label, and read as the hint. */
  description?: string;
  /**
   * Update `value` in the same event as `onValueChange` (plain React state), not on a later
   * tick: React Native's Switch sets the native view back to `value` right after each flip,
   * so a late update makes the switch jump back and forward.
   */
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  testID,
}: SwitchRowProps) {
  const theme = useTheme();
  const { colors, space, type } = theme;
  requireText(label, 'label', 'SwitchRow');

  return (
    <Pressable
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: MIN_TOUCH_TARGET,
        paddingVertical: space[3],
        opacity: disabled ? theme.opacity.disabled : undefined,
      }}
    >
      {/* No numberOfLines: text wraps at large sizes. */}
      <View style={{ flex: 1, gap: space[1] }}>
        <Text style={[type.body, { color: colors.text.primary }]}>{label}</Text>
        {description ? (
          <Text style={[type.caption, { color: colors.text.secondary }]}>{description}</Text>
        ) : null}
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ true: colors.forest.primary, false: colors.border.default }}
          thumbColor={colors.surface.primary}
          ios_backgroundColor={colors.border.default}
        />
      </View>
    </Pressable>
  );
}
