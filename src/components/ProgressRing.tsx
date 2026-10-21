import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  /**
   * forest for goals (default); accent for other progress; rest for progress that is on hold
   * (a paused focus session). There is no red tone.
   */
  tone?: 'forest' | 'accent' | 'rest';
  /**
   * `dial`: the large Focus ring with `children` inside it (this month's tree); its label and
   * value are read, not shown, because the countdown beside it says the same.
   */
  variant?: 'standard' | 'dial';
  children?: ReactNode;
  testID?: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A change smaller than this (in percent) moves at once: the Focus dial gains about a tenth of
 * a percent every second, and a 600 ms JS-thread animation for each would only cost frames.
 */
const STEP_WITHOUT_MOTION = 1;

export function ProgressRing({
  progress,
  label,
  valueText,
  tone = 'forest',
  variant = 'standard',
  children,
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
  // The value the ring last came to rest on.
  const settled = useRef(reducedMotion ? target : 0);

  useEffect(() => {
    const tiny = settled.current > 0 && Math.abs(target - settled.current) < STEP_WITHOUT_MOTION;
    if (reducedMotion || tiny) {
      animated.stopAnimation();
      animated.setValue(target);
      settled.current = target;
      setShown(target);
      return;
    }
    Animated.timing(animated, {
      toValue: target,
      duration: theme.motion.progress,
      easing: Easing.bezier(...theme.easing.standard),
      // SVG stroke props are animated on the JS thread.
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      settled.current = target;
      setShown(target);
    });
  }, [target, reducedMotion, animated, theme.motion.progress, theme.easing.standard]);

  const dial = variant === 'dial';
  const { size, strokeWidth } = dial ? theme.progressRing.dial : theme.progressRing;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ringColors = {
    forest: { arc: colors.forest.primary, track: colors.forest.soft },
    accent: { arc: colors.accent.primary, track: colors.accent.soft },
    // On hold: a neutral arc on a sunken track, 3:1 apart (tokens test).
    rest: { arc: colors.border.default, track: colors.surface.sunken },
  }[tone];
  const window = size - 2 * theme.progressRing.dial.inset;
  // Nothing to draw at 0%: a rounded cap on an empty arc would show as a dot.
  const drawArc = target > 0 || shown > 0;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target), text: valueText }}
      style={
        dial
          ? { alignSelf: 'center' }
          : {
              flexDirection: isLargeText ? 'column' : 'row',
              alignItems: isLargeText ? 'flex-start' : 'center',
              gap: space[3],
            }
      }
    >
      {/* The text beside it (or the countdown, for the dial) describes the ring, so the drawing is hidden. */}
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ width: size, height: size }}
      >
        {dial && children ? (
          <View
            style={{
              position: 'absolute',
              top: theme.progressRing.dial.inset,
              left: theme.progressRing.dial.inset,
              width: window,
              height: window,
              borderRadius: theme.radius.full,
              overflow: 'hidden',
              backgroundColor: colors.surface.sunken,
            }}
          >
            {children}
          </View>
        ) : null}
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
      {dial ? null : (
        <View style={{ flexShrink: 1 }}>
          <Text style={[type.caption, { color: colors.text.secondary }]}>{label}</Text>
          <Text style={[type.bodyStrong, { color: colors.text.primary }]}>{valueText}</Text>
        </View>
      )}
    </View>
  );
}
