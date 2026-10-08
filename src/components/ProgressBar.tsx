import { Text, View } from 'react-native';

import { useFontScale } from '../accessibility';
import { useTheme } from '../theme';
import { requireText } from './PressableSurface';

/**
 * Slim progress bar (docs/01_DESIGN_SYSTEM.md §8 → Progress indicators: achievement, mission,
 * and challenge progress, "a slim linear bar plus a fraction"). The fraction is always shown
 * and is the value read aloud: the bar never carries the meaning alone (docs/11), never turns
 * red, and does not animate, so long-term progress stays quiet (docs/02 Achievements).
 */
export interface ProgressBarProps {
  /** How full, 0–1. Values outside the range (or NaN) are clamped. */
  ratio: number;
  /** What is measured, such as "50 Hours". The accessible name. */
  label: string;
  /** The fraction in words, such as "32 / 50 h". Shown, and read aloud. */
  valueText: string;
  testID?: string;
}

export function ProgressBar({ ratio, label, valueText, testID }: ProgressBarProps) {
  const theme = useTheme();
  const { colors, space, type, radius } = theme;
  requireText(label, 'label', 'ProgressBar');
  requireText(valueText, 'valueText', 'ProgressBar');
  const { isLargeText } = useFontScale();
  const filled = Number.isNaN(ratio) ? 0 : Math.min(1, Math.max(0, ratio));
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(filled * 100), text: valueText }}
      style={{
        flexDirection: isLargeText ? 'column' : 'row',
        alignItems: isLargeText ? 'stretch' : 'center',
        gap: space[3],
      }}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{
          flex: isLargeText ? undefined : 1,
          height: theme.progressBar.height,
          borderRadius: radius.full,
          backgroundColor: colors.forest.soft,
          overflow: 'hidden',
        }}
      >
        <View
          testID="progress-bar-fill"
          style={{
            width: `${filled * 100}%`,
            height: '100%',
            borderRadius: radius.full,
            backgroundColor: colors.forest.primary,
          }}
        />
      </View>
      <Text style={[type.caption, { color: colors.text.secondary }]}>{valueText}</Text>
    </View>
  );
}
