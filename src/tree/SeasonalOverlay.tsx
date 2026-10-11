import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Line, Rect } from 'react-native-svg';

import { useReducedMotion } from '../accessibility';
import { useTheme } from '../theme';
import { SEASONAL_PALETTE } from './species/palette';

/** The seasonal art sets this app can draw; any other id draws nothing (docs/10: remote later). */
export const KNOWN_SEASONAL_ENVIRONMENTS = [
  'autumn',
  'winter',
  'sakura',
  'rain',
  'night',
  'summer',
] as const;
type SeasonalEnvironment = (typeof KNOWN_SEASONAL_ENVIRONMENTS)[number];

const isKnown = (id: string): id is SeasonalEnvironment =>
  (KNOWN_SEASONAL_ENVIRONMENTS as readonly string[]).includes(id);

/** Where marks fall on the 240 × 260 scene: fixed, so every device draws the same season. */
const SPOTS: readonly [number, number][] = [
  [24, 36],
  [70, 18],
  [118, 44],
  [170, 22],
  [214, 52],
  [40, 110],
  [200, 120],
  [16, 176],
  [222, 190],
  [58, 224],
  [190, 232],
];
const DRIFT = 10;

function Marks({ id }: { id: SeasonalEnvironment }) {
  const colors = SEASONAL_PALETTE[id];
  const tone = (i: number) => colors[i % colors.length]!;
  const opacity = SEASONAL_PALETTE.markOpacity;
  switch (id) {
    case 'autumn':
      return SPOTS.map(([x, y], i) => (
        <Ellipse
          key={i}
          cx={x}
          cy={y}
          rx={5}
          ry={2.5}
          rotation={(i * 47) % 180}
          origin={`${x}, ${y}`}
          fill={tone(i)}
          opacity={opacity}
        />
      ));
    case 'sakura':
      return SPOTS.map(([x, y], i) => (
        <Ellipse key={i} cx={x} cy={y} rx={3.5} ry={2.2} fill={tone(i)} opacity={opacity} />
      ));
    case 'winter':
      return SPOTS.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={2 + (i % 2)} fill={tone(i)} opacity={opacity} />
      ));
    case 'night':
      return SPOTS.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={1.6} fill={tone(i)} opacity={opacity} />
      ));
    case 'rain':
      return SPOTS.map(([x, y], i) => (
        <Line
          key={i}
          x1={x}
          y1={y}
          x2={x - 3}
          y2={y + 10}
          stroke={tone(i)}
          strokeWidth={1.2}
          opacity={opacity}
        />
      ));
    case 'summer':
      return [0, 1, 2].map((i) => (
        <Rect
          key={i}
          x={30 + i * 70}
          y={0}
          width={22}
          height={260}
          rotation={-15}
          origin={`${41 + i * 70}, 0`}
          fill={tone(i)}
          opacity={SEASONAL_PALETTE.rayOpacity}
        />
      ));
  }
}

/**
 * The season's atmosphere around the scene (docs/03 §10: themes change environment and
 * atmosphere layers, never the tree's earned structure). It is not part of the tree: the
 * TreeScene and its description stay the same. Decorative, so hidden from screen readers and
 * touches; it drifts gently and stands still under reduced motion or off screen (docs/11).
 */
export function SeasonalOverlay({
  environmentId,
  active = true,
}: {
  environmentId: string | null;
  active?: boolean;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const moving = active && !reducedMotion;
  const offset = useSharedValue(0);

  useEffect(() => {
    if (!moving) {
      cancelAnimation(offset);
      offset.value = 0;
      return;
    }
    offset.value = withRepeat(
      withTiming(DRIFT, {
        duration: theme.motion.ambient.drift,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
    return () => cancelAnimation(offset);
  }, [moving, offset, theme.motion.ambient.drift]);

  const drift = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  if (!environmentId || !isKnown(environmentId)) return null;
  return (
    <View
      testID="seasonal-overlay"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Animated.View
        testID={`seasonal-overlay-${environmentId}-${moving ? 'drift' : 'still'}`}
        style={[StyleSheet.absoluteFill, drift]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 240 260" preserveAspectRatio="xMidYMid slice">
          <Marks id={environmentId} />
        </Svg>
      </Animated.View>
    </View>
  );
}
