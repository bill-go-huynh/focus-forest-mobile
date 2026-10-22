import { useRouter } from 'expo-router';
import { memo, useEffect, useState, type ReactNode } from 'react';
import {
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFontScale, useReducedMotion } from '../accessibility';
import { Button } from '../components/Button';
import { useTheme, type Theme } from '../theme';
import { TreeScene, type TreeVisualState } from '../tree';
import { WELCOME_PAGES, type WelcomeArt } from './welcome-pages';

/**
 * The welcome (docs/02 Onboarding, docs/05 §3): what a signed-out person sees first. A few
 * swipeable pages show the concept (seed → tree → forest, then rest days) with the real tree
 * renderer, then lead to sign up, or straight to sign in from any page.
 *
 * Still pictures (owner, 2026-10-22: "lúc onboarding kh cần animation"): the pages follow the
 * finger, and only the backdrop's tone and the page dots blend between pages. The trees do not
 * move and the first page shows its seed already grown. Only the page in view is read by a
 * screen reader.
 *
 * Kept light while swiping: a page's trees are drawn only once a neighbouring page has settled
 * (never at the moment a page lands) and are kept from then on.
 */

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

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      offset.value = event.contentOffset.x;
    },
  });
  const onSettled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const settled = Math.round(event.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(last, settled)));
  };
  const goTo = (page: number) => {
    setIndex(page);
    pager.current?.scrollTo({ x: page * width, animated: !reducedMotion });
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
            width={width}
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
  width: number;
}

/**
 * One page: a still picture and its words (owner, 2026-10-22: no animation here). Memoized, so a
 * settled page changes only its own props and the other pages are not redrawn.
 */
const Page = memo(function Page({ index, title, body, art, current, near, width }: PageProps) {
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
        <View
          testID={`welcome-art-${index}`}
          style={{ alignItems: 'center' }}
          // Decorative: an example tree, not anyone's. The words below carry the meaning.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <Halo size={artWidth} />
          {near ? (
            <Art art={art} width={artWidth} />
          ) : (
            <View style={{ width: artWidth, height: artWidth / theme.treeScene.aspectRatio }} />
          )}
        </View>
        <View style={{ gap: theme.space[3] }}>
          <Text
            accessibilityRole="header"
            style={[theme.type.display, { color: theme.colors.text.primary, textAlign: 'center' }]}
          >
            {title}
          </Text>
          <Text
            style={[theme.type.body, { color: theme.colors.text.secondary, textAlign: 'center' }]}
          >
            {body}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
});

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

function Art({ art, width }: { art: WelcomeArt; width: number }) {
  if (art.kind === 'growing') {
    // The seed's grown stage: a still picture, not a growing sequence.
    return (
      <Card width={width}>
        <TreeScene
          tree={art.stages[art.stages.length - 1]!}
          timeOfDay={art.timeOfDay}
          motion="still"
        />
      </Card>
    );
  }
  if (art.kind === 'tree') {
    return (
      <Card width={width}>
        <TreeScene tree={art.tree} timeOfDay={art.timeOfDay} motion="still" />
      </Card>
    );
  }
  return <Forest trees={art.trees} timeOfDay={art.timeOfDay} width={width} />;
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

/** Three months side by side: the middle one in front, the others a little behind. */
function Forest({
  trees,
  timeOfDay,
  width,
}: {
  trees: readonly TreeVisualState[];
  timeOfDay: WelcomeArt['timeOfDay'];
  width: number;
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
          <TreeScene tree={tree} timeOfDay={timeOfDay} motion="still" />
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
