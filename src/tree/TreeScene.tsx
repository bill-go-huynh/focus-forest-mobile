import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useReducedMotion } from '../accessibility';
import { useTheme } from '../theme';
import { describeTree } from './describe-tree';
import {
  idlePlan,
  reactionPlan,
  type IdlePlan,
  type SceneMotion,
  type TreeReaction,
} from './motion-plan';
import { ambientFor, sceneColors, sceneLighting, timeOfDayAt, type TimeOfDay } from './scene';
import { Backdrop, LightOverlay, TreeArt } from './TreeArt';
import { useAppActive } from './use-app-active';
import { composeTree } from './composition';
import type { TreeVisualState } from './visual-state';

/**
 * The monthly tree scene (docs/03 §7–8, docs/04 §5): the reusable core renderer for Home,
 * Session Completion, Tree Details, and the forest. It draws a `TreeVisualState` (server truth)
 * under a local time-of-day light, with calm idle motion that stops under reduced motion, off
 * screen (`active={false}`), and in the background. Screen readers get one image described from
 * the tree's state. It knows nothing about queries, routes, or sessions: callers pass the tree.
 *
 * `ref.react(reaction)` plays a growth reaction once the server has said what changed; the
 * scene already shows the new tree. Off screen it just shows the final state.
 */

export interface TreeSceneHandle {
  react(reaction: TreeReaction): void;
}

export interface TreeSceneProps {
  tree: TreeVisualState;
  /** `hero` fills the width (Home, Tree Details); `thumbnail` is a forest tile. */
  size?: 'hero' | 'thumbnail';
  /** The lighting preset; by default from this device's clock when the scene appears. */
  timeOfDay?: TimeOfDay;
  /** Defaults to `full` for a hero and `calm` for a thumbnail. */
  motion?: SceneMotion;
  /** False while the scene is off screen: animation stops. */
  active?: boolean;
  /** For the month in the description; the device's locale by default. */
  locale?: string;
  testID?: string;
  ref?: Ref<TreeSceneHandle>;
}

/** How far the canopy leans in a gust, in degrees, before it settles. */
const GUST_DEGREES = 2;
/** The canopy's opacity when a growth reaction starts: it brightens back in. */
const CANOPY_REVEAL_FROM = 0.7;

export function TreeScene({
  tree,
  size = 'hero',
  timeOfDay,
  motion,
  active = true,
  locale,
  testID,
  ref,
}: TreeSceneProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const running = active && appActive;
  const [deviceTime] = useState(() => timeOfDayAt(new Date()));
  const lighting = sceneLighting(timeOfDay ?? deviceTime);
  const ambient = ambientFor(tree.ambience);
  const sceneMotion = motion ?? (size === 'thumbnail' ? 'calm' : 'full');

  const plan = useMemo(
    () => idlePlan({ motion: sceneMotion, reducedMotion, running, ambient, tokens: theme.motion }),
    [sceneMotion, reducedMotion, running, ambient, theme.motion],
  );
  const light = useMemo(
    () => sceneColors(composeTree(tree), ambient, lighting).light,
    [tree, ambient, lighting],
  );

  const canopy = useSharedValue(0);
  const front = useSharedValue(0);
  const drift = useSharedValue(0);
  const gust = useSharedValue(0);
  const reveal = {
    canopy: useSharedValue(1),
    tree: useSharedValue(1),
    blossoms: useSharedValue(1),
    traits: useSharedValue(1),
  };
  const outgoingOpacity = useSharedValue(0);
  useIdleMotion(plan, canopy, front, drift);

  const [outgoing, setOutgoing] = useState<TreeVisualState | null>(null);
  const outgoingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (outgoingTimer.current) clearTimeout(outgoingTimer.current);
    },
    [],
  );

  useImperativeHandle(ref, () => ({
    react(reaction) {
      const step = reactionPlan(reaction.kind, { reducedMotion, running, tokens: theme.motion });
      if (outgoingTimer.current) clearTimeout(outgoingTimer.current);
      outgoingTimer.current = null;
      const target = reveal[step.reveal];
      if (step.durationMs === 0) {
        for (const value of Object.values(reveal)) value.value = 1;
        setOutgoing(null);
        return;
      }
      const timing = {
        duration: step.durationMs,
        easing: Easing.bezier(...theme.easing.standard),
      };
      target.value = step.reveal === 'canopy' ? CANOPY_REVEAL_FROM : 0;
      target.value = withTiming(1, timing);
      if (step.crossfade && reaction.kind === 'stage') {
        setOutgoing(reaction.from);
        outgoingOpacity.value = 1;
        outgoingOpacity.value = withTiming(0, timing);
        outgoingTimer.current = setTimeout(() => {
          outgoingTimer.current = null;
          setOutgoing(null);
        }, step.durationMs);
      }
      if (step.gust) {
        gust.value = withSequence(
          withTiming(GUST_DEGREES, { duration: theme.motion.base }),
          withSpring(0, theme.spring.gentle),
        );
      }
    },
  }));

  const canopyStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${canopy.value + gust.value}deg` }],
  }));
  const frontStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${front.value}deg` }] }));
  const particleStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drift.value }] }));
  const canopyRevealStyle = useAnimatedStyle(() => ({ opacity: reveal.canopy.value }));
  const treeStyle = useAnimatedStyle(() => ({ opacity: reveal.tree.value }));
  const blossomStyle = useAnimatedStyle(() => ({ opacity: reveal.blossoms.value }));
  const traitStyle = useAnimatedStyle(() => ({ opacity: reveal.traits.value }));
  const outgoingStyle = useAnimatedStyle(() => ({ opacity: outgoingOpacity.value }));

  const sizeStyle: ViewStyle = {
    width: size === 'thumbnail' ? theme.treeScene.thumbnail : '100%',
    aspectRatio: theme.treeScene.aspectRatio,
    overflow: 'hidden',
  };

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={describeTree(tree, locale)}
      style={sizeStyle}
    >
      {/* Decorative: the description above is the whole tree for assistive technology. */}
      <View
        testID="tree-scene-art"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Backdrop lighting={lighting} />
        {outgoing ? (
          <Animated.View testID="tree-outgoing" style={[StyleSheet.absoluteFill, outgoingStyle]}>
            <TreeArt tree={outgoing} lighting={lighting} />
          </Animated.View>
        ) : null}
        <Animated.View style={[StyleSheet.absoluteFill, treeStyle]}>
          <TreeArt
            tree={tree}
            lighting={lighting}
            motion={{
              canopy: canopyStyle,
              canopyReveal: canopyRevealStyle,
              front: frontStyle,
              blossoms: blossomStyle,
              traits: traitStyle,
              particles: particleStyle,
            }}
          />
        </Animated.View>
        <LightOverlay color={light.color} opacity={light.opacity} />
      </View>
    </View>
  );
}

/** Slow, independent sways and drift while the plan allows; still otherwise. */
function useIdleMotion(
  plan: IdlePlan | null,
  canopy: SharedValue<number>,
  front: SharedValue<number>,
  drift: SharedValue<number>,
) {
  useEffect(() => {
    const values = [canopy, front, drift];
    if (!plan) {
      for (const value of values) {
        cancelAnimation(value);
        value.value = 0;
      }
      return;
    }
    const sway = (value: SharedValue<number>, amplitude: number, cycleMs: number) => {
      if (amplitude <= 0) return;
      const easing = Easing.inOut(Easing.sin);
      value.value = withSequence(
        withTiming(-amplitude, { duration: cycleMs / 4, easing }),
        withRepeat(withTiming(amplitude, { duration: cycleMs / 2, easing }), -1, true),
      );
    };
    sway(canopy, plan.canopyDegrees, plan.canopyCycleMs);
    sway(front, plan.frontDegrees, plan.foliageCycleMs);
    sway(drift, plan.driftDistance, plan.driftCycleMs);
    return () => {
      for (const value of values) cancelAnimation(value);
    };
  }, [plan, canopy, front, drift]);
}
