import { useEffect, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useFontScale, useReducedMotion } from '../accessibility';
import { useTheme } from '../theme';
import { requireText } from './PressableSurface';

/**
 * Progress ring (docs/01_DESIGN_SYSTEM.md §8 → Progress indicators): a soft ring with
 * rounded caps and a text value beside it. The ring never carries the meaning alone
 * (docs/11), and progress never turns red.
 */

/** Clamps a percentage to 0–100. NaN counts as 0. */
export function clampProgress(percent: number): number {
  if (Number.isNaN(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

export interface ProgressRingProps {
  /** Percentage, 0–100. Values outside the range are clamped. */
  progress: number;
  /** What is measured, such as "Daily goal". Shown, and the accessible name. */
  label: string;
  /** The value in words, such as "42 / 60 min" or "Goal reached". Shown, and read aloud. */
  valueText: string;
  /** forest for goals (default); accent for other progress. There is no red tone. */
  tone?: 'forest' | 'accent';
  testID?: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function ProgressRing({
  progress,
  label,
  valueText,
  tone = 'forest',
  testID,
}: ProgressRingProps) {
  const theme = useTheme();
  const { colors, space, type } = theme;
  requireText(label, 'label', 'ProgressRing');
  requireText(valueText, 'valueText', 'ProgressRing');
  const reducedMotion = useReducedMotion();
  const { isLargeText } = useFontScale();

  const target = clampProgress(progress);
  const [animated] = useState(() => new Animated.Value(reducedMotion ? target : 0));
  // Under reduced motion the ring shows the final state at once (docs/04 §8).
  const [shown, setShown] = useState(reducedMotion ? target : 0);
  if (reducedMotion && shown !== target) setShown(target);

  useEffect(() => {
    if (reducedMotion) {
      animated.setValue(target);
      return;
    }
    Animated.timing(animated, {
      toValue: target,
      duration: theme.motion.progress,
      easing: Easing.bezier(...theme.easing.standard),
      // SVG stroke props are animated on the JS thread.
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setShown(target);
    });
  }, [target, reducedMotion, animated, theme.motion.progress, theme.easing.standard]);

  const { size, strokeWidth } = theme.progressRing;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ringColors =
    tone === 'forest'
      ? { arc: colors.forest.primary, track: colors.forest.soft }
      : { arc: colors.accent.primary, track: colors.accent.soft };
  // Nothing to draw at 0%: a rounded cap on an empty arc would show as a dot.
  const drawArc = target > 0 || shown > 0;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target), text: valueText }}
      style={{
        flexDirection: isLargeText ? 'column' : 'row',
        alignItems: isLargeText ? 'flex-start' : 'center',
        gap: space[3],
      }}
    >
      {/* The text beside it describes the ring, so the drawing is hidden. */}
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            testID="progress-ring-track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColors.track}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {drawArc ? (
            <AnimatedCircle
              testID="progress-ring-arc"
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={ringColors.arc}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={[circumference, circumference]}
              strokeDashoffset={animated.interpolate({
                inputRange: [0, 100],
                outputRange: [circumference, 0],
              })}
              // Start at twelve o'clock and run clockwise.
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          ) : null}
        </Svg>
      </View>
      {/* No numberOfLines: text wraps at large sizes instead of truncating. */}
      <View style={{ flexShrink: 1 }}>
        <Text style={[type.caption, { color: colors.text.secondary }]}>{label}</Text>
        <Text style={[type.bodyStrong, { color: colors.text.primary }]}>{valueText}</Text>
      </View>
    </View>
  );
}
