import { useRouter } from 'expo-router';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  interpolate,
  interpolateColor,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFontScale, useReducedMotion } from '../accessibility';
import { Button } from '../components/Button';
import { useTheme, type Theme } from '../theme';
import { TreeScene, type TreeSceneHandle, type TreeVisualState } from '../tree';
import { WELCOME_PAGES, type WelcomeArt } from './welcome-pages';

/**
 * The welcome (docs/02 Onboarding, docs/05 §3): what a signed-out person sees first. A few
 * swipeable pages show the concept (seed → tree → forest, then rest days) with the real tree
 * renderer, then lead to sign up, or straight to sign in from any page.
 *
 * Motion (docs/04): the pages follow the finger. The art lags behind the page (parallax) and
 * settles in scale, the words lead it, the backdrop's tone and the page dots blend between
 * pages, and the art floats gently. Under reduced motion every movement becomes a crossfade.
 * Only the page in view animates its tree and is read by a screen reader.
 *
 * Kept light while the pages move (owner, 2026-10-22: swiping felt heavy): a page's trees are
 * drawn only once a neighbouring page has settled (never at the moment a page lands) and are
 * kept from then on, and while the pages move the trees hold still and each page's art moves
 * as one cached picture instead of being redrawn every frame.
 */

/** How far the art lags behind its page, and the words lead it, as a share of the width. */
const ART_LAG = 0.45;
const TEXT_LEAD = 0.2;
/** How much a page's art shrinks and fades as it leaves. */
const ART_SHRINK = 0.14;
const ART_FADE = 0.7;
/** The art's share of the screen height, so the words and buttons always fit below it. */
const ART_HEIGHT_SHARE = 0.44;
/** The forest's centre tree, as a share of the art's width, and its side trees beside it. */
const FOREST_CENTRE_SHARE = 0.42;
const SIDE_TREE_SCALE = 0.72;
/** The glow behind the art, relative to the art's width. */
const HALO_SCALE = 1.15;
/** Under large text the art gives up half its room to the words (docs/11). */
const LARGE_TEXT_ART_SCALE = 0.5;

export function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  const pager = useAnimatedRef<Animated.ScrollView>();
  const offset = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const last = WELCOME_PAGES.length - 1;
  // True while the pages move (a drag, its fling, or Next).
  const [moving, setMoving] = useState(false);
  // The pages whose trees are drawn: the first two, then each settled page's neighbours.
  const [drawn, setDrawn] = useState<ReadonlySet<number>>(() => new Set([0, 1]));
  useEffect(() => {
    const ahead = [index - 1, index, index + 1].filter((i) => i >= 0 && i <= last);
    if (ahead.every((i) => drawn.has(i))) return undefined;
    // After the landing has played, so drawing a tree never costs the swipe a frame.
    const timer = setTimeout(
      () => setDrawn((now) => new Set([...now, ...ahead])),
      theme.motion.base,
    );
    return () => clearTimeout(timer);
  }, [index, drawn, last, theme.motion.base]);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      offset.value = event.contentOffset.x;
    },
  });
  const onSettled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const settled = Math.round(event.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(last, settled)));
    setMoving(false);
  };
  const goTo = (page: number) => {
    setIndex(page);
    pager.current?.scrollTo({ x: page * width, animated: !reducedMotion });
    if (reducedMotion) return;
    // A scroll the app starts may not report its end: the pages rest once it has had time.
    setMoving(true);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setMoving(false), theme.motion.progress);
  };

  const tints = pageTints(theme);
  const backdropStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      offset.value / width,
      tints.map((_, i) => i),
      tints,
    ),
  }));

  return (
    <Animated.View testID="welcome" style={[{ flex: 1 }, backdropStyle]}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          columnGap: theme.space[3],
          paddingTop: top + theme.space[2],
          paddingHorizontal: theme.space[5],
          minHeight: top + theme.control.minHeight,
        }}
      >
        <Text
          style={[
            theme.type.headline,
            { fontFamily: theme.type.display.fontFamily, color: theme.colors.text.primary },
          ]}
        >
          Focus Forest
        </Text>
        {/* Someone with an account finds it where apps keep it, on every page, in one tap. */}
        <Button variant="tertiary" label="Sign in" onPress={() => router.push('/sign-in')} />
      </View>

      <Animated.ScrollView
        testID="welcome-pager"
        ref={pager}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => setMoving(true)}
        onMomentumScrollEnd={onSettled}
        style={{ flex: 1 }}
      >
        {WELCOME_PAGES.map((page, i) => (
          <Page
            key={page.key}
            index={i}
            title={page.title}
            body={page.body}
            art={page.art}
            current={i === index}
            near={drawn.has(i)}
            moving={moving}
            offset={offset}
            width={width}
            reducedMotion={reducedMotion}
          />
        ))}
      </Animated.ScrollView>

      <View
        style={{
          paddingHorizontal: theme.space[5],
          paddingBottom: bottom + theme.space[4],
          gap: theme.space[3],
        }}
      >
        <Dots offset={offset} width={width} index={index} />
        {index < last ? (
          <>
            <Button variant="primary" label="Next" onPress={() => goTo(index + 1)} />
            {/* Straight to sign up from any page; on the last, Get started is the way. */}
            <Button
              variant="tertiary"
              label="Create account"
              onPress={() => router.push('/sign-up')}
            />
          </>
        ) : (
          <Button variant="primary" label="Get started" onPress={() => router.push('/sign-up')} />
        )}
      </View>
    </Animated.View>
  );
}

/** Each page's backdrop tone, from the theme: dawn paper, warm gold, the forest, the night. */
function pageTints(theme: Theme): string[] {
  const { background, accent, surface } = theme.colors;
  return [background.primary, accent.soft, background.secondary, surface.sunken];
}

interface PageProps {
  index: number;
  title: string;
  body: string;
  art: WelcomeArt;
  current: boolean;
  /** Whether this page draws its trees yet (see `drawn`). */
  near: boolean;
  /** The pages are moving: the trees hold still and the art moves as one picture. */
  moving: boolean;
  offset: SharedValue<number>;
  width: number;
  reducedMotion: boolean;
}

/** Memoized: a settled page changes only its own props, so the other pages are not redrawn. */
const Page = memo(function Page({
  index,
  title,
  body,
  art,
  current,
  near,
  moving,
  offset,
  width,
  reducedMotion,
}: PageProps) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const { isLargeText } = useFontScale();
  const artWidth = Math.min(
    width - theme.space[16],
    height *
      ART_HEIGHT_SHARE *
      theme.treeScene.aspectRatio *
      (isLargeText ? LARGE_TEXT_ART_SCALE : 1),
  );

  const artStyle = useAnimatedStyle(() => {
    const away = offset.value / width - index;
    const distance = Math.min(Math.abs(away), 1);
    if (reducedMotion) return { opacity: 1 - distance };
    return {
      opacity: 1 - distance * ART_FADE,
      transform: [{ translateX: away * width * ART_LAG }, { scale: 1 - distance * ART_SHRINK }],
    };
  });
  const textStyle = useAnimatedStyle(() => {
    const away = offset.value / width - index;
    const opacity = interpolate(Math.abs(away), [0, 0.6], [1, 0], 'clamp');
    if (reducedMotion) return { opacity };
    return { opacity, transform: [{ translateX: -away * width * TEXT_LEAD }] };
  });

  // The first page arrives: its art rises into place, then its words follow.
  const first = index === 0;
  const enter = (delay: number) =>
    reducedMotion
      ? FadeIn.duration(theme.motion.base)
      : FadeInDown.duration(theme.motion.growth)
          .delay(delay)
          .easing(Easing.bezier(...theme.easing.enter).factory());

  return (
    <View
      style={{ width }}
      accessibilityElementsHidden={!current}
      importantForAccessibility={current ? 'auto' : 'no-hide-descendants'}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: theme.space[6],
          gap: theme.space[8],
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* The arrival animates a wrapper; the swipe animates the view inside it, so neither
            overwrites the other. */}
        <Animated.View entering={first ? enter(0) : undefined}>
          <Animated.View
            testID={`welcome-art-${index}`}
            style={[{ alignItems: 'center' }, artStyle]}
            renderToHardwareTextureAndroid={moving}
            shouldRasterizeIOS={moving}
            // Decorative: an example tree, not anyone's. The words below carry the meaning.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
          >
            <Float active={current && !moving && !reducedMotion}>
              <Halo size={artWidth} />
              {near ? (
                <Art art={art} width={artWidth} active={current && !moving} />
              ) : (
                <View style={{ width: artWidth, height: artWidth / theme.treeScene.aspectRatio }} />
              )}
            </Float>
          </Animated.View>
        </Animated.View>
        <Animated.View entering={first ? enter(theme.motion.base) : undefined}>
          <Animated.View style={[{ gap: theme.space[3] }, textStyle]}>
            <Text
              accessibilityRole="header"
              style={[
                theme.type.display,
                { color: theme.colors.text.primary, textAlign: 'center' },
              ]}
            >
              {title}
            </Text>
            <Text
              style={[theme.type.body, { color: theme.colors.text.secondary, textAlign: 'center' }]}
            >
              {body}
            </Text>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </View>
  );
});

/** The art floats up and down very slowly while its page is in view. */
function Float({ active, children }: { active: boolean; children: ReactNode }) {
  const theme = useTheme();
  const lift = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      lift.value = withTiming(0, { duration: theme.motion.base });
      return;
    }
    const half = { duration: theme.motion.ambient.drift / 2, easing: Easing.inOut(Easing.sin) };
    lift.value = withRepeat(
      withSequence(withTiming(-theme.space[2], half), withTiming(0, half)),
      -1,
    );
  }, [active, lift, theme]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));
  return <Animated.View style={[{ alignItems: 'center' }, style]}>{children}</Animated.View>;
}

/** A soft round glow behind the art. */
function Halo({ size }: { size: number }) {
  const theme = useTheme();
  const diameter = size * HALO_SCALE;
  return (
    <View
      style={{
        position: 'absolute',
        top: (size / theme.treeScene.aspectRatio - diameter) / 2,
        width: diameter,
        height: diameter,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface.elevated,
        opacity: theme.opacity.muted,
      }}
    />
  );
}

function Art({ art, width, active }: { art: WelcomeArt; width: number; active: boolean }) {
  if (art.kind === 'growing') {
    return (
      <GrowingTree stages={art.stages} timeOfDay={art.timeOfDay} width={width} active={active} />
    );
  }
  if (art.kind === 'tree') {
    return (
      <Card width={width}>
        <TreeScene tree={art.tree} timeOfDay={art.timeOfDay} active={active} />
      </Card>
    );
  }
  return <Forest trees={art.trees} timeOfDay={art.timeOfDay} width={width} active={active} />;
}

/** A rounded frame around a scene, softly raised. */
function Card({ width, children }: { width: number; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[{ width, borderRadius: theme.radius.xl }, theme.elevation[2]]}>
      <View style={{ borderRadius: theme.radius.xl, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

/**
 * The first page's seed grows while the page is in view, a stage at a time, with the scene's
 * own stage crossfade. Under reduced motion it is shown already grown.
 */
function GrowingTree({
  stages,
  timeOfDay,
  width,
  active,
}: {
  stages: readonly TreeVisualState[];
  timeOfDay: WelcomeArt['timeOfDay'];
  width: number;
  active: boolean;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const scene = useRef<TreeSceneHandle>(null);
  const [step, setStep] = useState(0);
  const shown = reducedMotion ? stages.length - 1 : step;

  useEffect(() => {
    if (!active || reducedMotion || step >= stages.length - 1) return;
    const timer = setTimeout(() => setStep((s) => s + 1), theme.motion.growth);
    return () => clearTimeout(timer);
  }, [active, reducedMotion, step, stages.length, theme.motion.growth]);

  useEffect(() => {
    if (step === 0 || reducedMotion) return;
    scene.current?.react({ kind: 'stage', from: stages[step - 1]! });
  }, [step, stages, reducedMotion]);

  return (
    <Card width={width}>
      <TreeScene ref={scene} tree={stages[shown]!} timeOfDay={timeOfDay} active={active} />
    </Card>
  );
}

/** Three months side by side: the middle one in front, the others a little behind. */
function Forest({
  trees,
  timeOfDay,
  width,
  active,
}: {
  trees: readonly TreeVisualState[];
  timeOfDay: WelcomeArt['timeOfDay'];
  width: number;
  active: boolean;
}) {
  const theme = useTheme();
  const centre = width * FOREST_CENTRE_SHARE;
  const side = centre * SIDE_TREE_SCALE;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: theme.space[2],
      }}
    >
      {trees.map((tree, i) => (
        <Card key={tree.speciesId} width={i === 1 ? centre : side}>
          <TreeScene tree={tree} timeOfDay={timeOfDay} motion="calm" active={active} />
        </Card>
      ))}
    </View>
  );
}

/** One dot per page; the current one widens and takes the accent, following the finger. */
function Dots({
  offset,
  width,
  index,
}: {
  offset: SharedValue<number>;
  width: number;
  index: number;
}) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Page ${index + 1} of ${WELCOME_PAGES.length}`}
      style={{
        flexDirection: 'row',
        justifyContent: 'center',
        gap: theme.space[2],
        paddingVertical: theme.space[2],
      }}
    >
      {WELCOME_PAGES.map((page, i) => (
        <Dot key={page.key} index={i} offset={offset} width={width} />
      ))}
    </View>
  );
}

function Dot({
  index,
  offset,
  width,
}: {
  index: number;
  offset: SharedValue<number>;
  width: number;
}) {
  const theme = useTheme();
  const { muted } = theme.colors.text;
  const { primary } = theme.colors.accent;
  const style = useAnimatedStyle(() => {
    const near = 1 - Math.min(Math.abs(offset.value / width - index), 1);
    return {
      width: interpolate(near, [0, 1], [theme.space[2], theme.space[6]]),
      backgroundColor: interpolateColor(near, [0, 1], [muted, primary]),
    };
  });
  return (
    <Animated.View style={[{ height: theme.space[2], borderRadius: theme.radius.full }, style]} />
  );
}
