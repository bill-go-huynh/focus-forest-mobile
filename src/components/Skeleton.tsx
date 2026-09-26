import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, View, type DimensionValue } from 'react-native';

import { useFontScale, useReducedMotion } from '../accessibility';
import { useTheme } from '../theme';

/**
 * Loading skeletons (docs/01_DESIGN_SYSTEM.md §9): shapes in the surface tone with a slow,
 * subtle shimmer, and no shimmer under reduced motion. Skeletons are hidden from screen
 * readers; wrap them in a SkeletonGroup, which says what is loading.
 */
export interface SkeletonProps {
  /** text: lines sized like body text. block: a card-sized area. circle: an avatar or icon. */
  variant: 'text' | 'block' | 'circle';
  /** Number of text lines (text only, default 1). The last of several is shorter. */
  lines?: number;
  /** Height for block and circle, from a theme token. */
  height?: number;
  /** Width for text and block (default "100%"). A circle is as wide as it is tall. */
  width?: DimensionValue;
}

export function Skeleton({ variant, lines = 1, height, width = '100%' }: SkeletonProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const { scaled } = useFontScale();
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    const breathe = (toValue: number) =>
      Animated.timing(opacity, {
        toValue,
        duration: theme.motion.growth,
        easing: Easing.bezier(...theme.easing.standard),
        useNativeDriver: true,
      });
    const shimmer = Animated.loop(Animated.sequence([breathe(theme.opacity.muted), breathe(1)]));
    shimmer.start();
    return () => shimmer.stop();
  }, [opacity, reducedMotion, theme.motion.growth, theme.easing.standard, theme.opacity.muted]);

  const tone = { backgroundColor: theme.colors.surface.sunken, opacity };

  if (variant === 'text') {
    // Text lines follow the system text size, so the loaded layout does not jump.
    const lineHeight = scaled(theme.type.body.lineHeight);
    return (
      <View style={{ gap: theme.space[2] }}>
        {Array.from({ length: lines }, (_, index) => (
          <Animated.View
            key={index}
            testID="skeleton"
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[
              tone,
              {
                height: lineHeight,
                width: lines > 1 && index === lines - 1 ? '60%' : width,
                borderRadius: theme.radius.sm,
              },
            ]}
          />
        ))}
      </View>
    );
  }

  const size = height ?? theme.space[16];
  return (
    <Animated.View
      testID="skeleton"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        tone,
        variant === 'circle'
          ? { height: size, width: size, borderRadius: theme.radius.full }
          : { height: size, width, borderRadius: theme.radius.lg },
      ]}
    />
  );
}

/** Groups skeletons into one element that tells screen readers the area is loading. */
export function SkeletonGroup({
  label = 'Loading',
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={{ gap: theme.space[3] }}
    >
      {children}
    </View>
  );
}
