import { memo, useId, useMemo, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse as SvgEllipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import {
  composeTree,
  type Dot,
  type Ellipse,
  type TraitMark,
  type TreeComposition,
} from './composition';
import { KNOWN_BACKGROUNDS, KNOWN_DECORATIONS } from './environment';
import { ambientFor, mix, particlesFor, sceneColors, type SceneColors } from './scene';
import { barkVolume, clusterOutline, KEY_LIGHT, tone, volume } from './signature/brush';
import { SIGNATURE_PALETTE, type LightingPreset } from './signature/palette';
import { GROUND_Y, TREE_VIEWBOX } from './signature/stages';
import { speciesDefinition } from './species';
import { ENVIRONMENT_PALETTE } from './species/palette';
import type { TreeVisualState } from './visual-state';
import { radius } from '../theme/tokens';

/**
 * The drawn layers of one tree (docs/03 §7), back to front, each a full-size SVG in the scene's
 * view box. Layers that move are wrapped in their own animated views, so motion runs on the UI
 * thread and the trunk never moves. Nothing here is accessible: the scene is one image.
 *
 * Painted in direction B, painterly-flat (ART.1): foliage clusters are organic outlines inside
 * their authored ellipses, each lit from the upper left by a volume gradient (`signature/brush`).
 */

type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style'];

/** Animated styles for the moving layers; absent ones stay still. */
export interface TreeArtMotion {
  canopy?: AnimatedViewStyle;
  canopyReveal?: AnimatedViewStyle;
  /** Each foliage layer's own sway (docs/04 §5); blossoms and canopy traits follow the main. */
  back?: AnimatedViewStyle;
  main?: AnimatedViewStyle;
  mainBlossoms?: AnimatedViewStyle;
  mainTraits?: AnimatedViewStyle;
  front?: AnimatedViewStyle;
  blossoms?: AnimatedViewStyle;
  traits?: AnimatedViewStyle;
  /** Particles drift and fireflies glow on clocks from 0 to 1, each particle on its own phase. */
  drift?: ParticleDrift;
}

export interface ParticleDrift {
  clock: SharedValue<number>;
  twinkle: SharedValue<number>;
  /** In view-box units; 0 keeps particles still. */
  distance: number;
}

const { width: W, height: H } = TREE_VIEWBOX;
const VIEWBOX = `0 0 ${W} ${H}`;
const MIRROR = `translate(${W}, 0) scale(-1, 1)`;

function Layer({ children }: { children: ReactNode }) {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox={VIEWBOX} preserveAspectRatio="xMidYMax meet">
      {children}
    </Svg>
  );
}

function Shape({ shape, fill, opacity }: { shape: Ellipse; fill: string; opacity?: number }) {
  return (
    <SvgEllipse
      cx={shape.cx}
      cy={shape.cy}
      rx={shape.rx}
      ry={shape.ry}
      fill={fill}
      opacity={opacity}
      rotation={shape.rotation}
      origin={`${shape.cx}, ${shape.cy}`}
    />
  );
}

/** A lit leaf color: pale on the upper left, shaded on the lower right. */
function LeafLight({ id, color }: { id: string; color: string }) {
  const v = volume(color);
  return (
    <RadialGradient id={id} cx={KEY_LIGHT.cx} cy={KEY_LIGHT.cy} r={KEY_LIGHT.r}>
      <Stop offset="0" stopColor={v.light} />
      <Stop offset="0.55" stopColor={color} />
      <Stop offset="1" stopColor={v.dark} />
    </RadialGradient>
  );
}

/** One leaf cluster: an organic outline inside its authored ellipse. */
function Cluster({
  shape,
  fill,
  opacity,
  rim,
}: {
  shape: Ellipse;
  fill: string;
  opacity?: number;
  /** A thin darker edge (ART.10). */
  rim?: string;
}) {
  return (
    <Path
      d={clusterOutline(shape, shape.key)}
      fill={fill}
      opacity={opacity}
      stroke={rim}
      strokeWidth={rim ? 0.8 : undefined}
      strokeOpacity={rim ? SIGNATURE_PALETTE.opacity.rim : undefined}
    />
  );
}

/** The canopy light band a cluster sits in: 0 lit, then mid, shade, deep (ART.10). */
function bandOf(shape: Ellipse, box: Box): number {
  const l = SIGNATURE_PALETTE.canopyLight;
  const d = Math.hypot(
    shape.cx - (box.x + box.width * l.cx),
    shape.cy - (box.y + box.height * l.cy),
  );
  const t = d / (Math.max(box.width, box.height) * l.reach);
  return Math.min(l.bands.length - 1, Math.floor(Math.max(0, t) * l.bands.length));
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The box around every foliage cluster; null for a tree with no foliage yet. */
export function canopyBox(c: TreeComposition): Box | null {
  const all = [...c.foliage.back, ...c.foliage.main, ...c.foliage.front];
  if (all.length === 0) return null;
  const left = Math.min(...all.map((e) => e.cx - e.rx));
  const right = Math.max(...all.map((e) => e.cx + e.rx));
  const top = Math.min(...all.map((e) => e.cy - e.ry));
  const bottom = Math.max(...all.map((e) => e.cy + e.ry));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** A full canopy (from the Young Tree on) gets the joining core and the trunk shade. */
const FULL_CANOPY = 4;

/** A small deterministic fraction for the seed and an index, so tufts never move between renders. */
const unit = (seed: number, i: number) => (((seed ^ (i * 2654435761)) >>> 0) % 1000) / 1000;

/** Grass tufts around the mound (ART.10): three blades each, darker than the ground. */
function GrassTufts({ mound, seed, color }: { mound: Ellipse; seed: number; color: string }) {
  const g = SIGNATURE_PALETTE.grass;
  return (
    <>
      {Array.from({ length: g.tufts }, (_, i) => {
        const t = i / (g.tufts - 1);
        const x = mound.cx + (t - 0.5) * mound.rx * 2.5 + (unit(seed, i) - 0.5) * 6;
        const y = mound.cy + mound.ry * (0.5 + unit(seed, i + 40) * 0.6);
        const h = g.height * (0.7 + unit(seed, i + 80) * 0.6);
        return (
          <Path
            key={i}
            d={`M${x} ${y} q-1 ${-h * 0.6} -2.6 ${-h} M${x} ${y} q0.4 ${-h * 0.7} 0.6 ${-h * 1.15} M${x} ${y} q1 ${-h * 0.6} 2.6 ${-h * 0.9}`}
            stroke={color}
            strokeWidth={g.width}
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
    </>
  );
}

export const TreeArt = memo(function TreeArt({
  tree,
  lighting,
  motion = {},
  effects = true,
}: {
  tree: TreeVisualState;
  lighting: LightingPreset;
  motion?: TreeArtMotion;
  /** A rare variant's effect; off where it cannot be seen (a forest thumbnail). */
  effects?: boolean;
}) {
  const composition = useMemo(() => composeTree(tree), [tree]);
  const ambient = ambientFor(tree.ambience);
  const colors = useMemo(
    () => sceneColors(composition, ambient, lighting),
    [composition, ambient, lighting],
  );
  const particles = useMemo(
    () => particlesFor(composition, ambient, lighting),
    [composition, ambient, lighting],
  );
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const glowId = `glow-${uid}`;
  const poolId = `pool-${uid}`;
  const barkId = `bark-${uid}`;
  const moundId = `mound-${uid}`;
  const bandId = (layer: string, band: number) => `band-${uid}-${layer}-${band}`;
  const trunkShadeId = `trunkshade-${uid}`;
  const leafId = {
    back: `leaf-${uid}-back`,
    main: `leaf-${uid}-main`,
    accent: `leaf-${uid}-accent`,
    front: `leaf-${uid}-front`,
  };
  const url = (id: string) => `url(#${id})`;
  const bark = barkVolume(colors.bark);
  const c = composition;
  const pivot: ViewStyle = {
    transformOrigin: `${(c.pivot.x / W) * 100}% ${(c.pivot.y / H) * 100}%`,
  };
  const leaf = (accent: boolean) => url(accent ? leafId.accent : leafId.main);
  const density = speciesDefinition(c.species).bloomDensity ?? SINGLE_FLOWER;
  const fixedTraits = c.traits.filter((mark) => mark.anchor !== 'canopy');
  const canopyTraits = c.traits.filter((mark) => mark.anchor === 'canopy');
  const box = useMemo(() => canopyBox(c), [c]);
  const fullCanopy = box !== null && c.foliage.main.length >= FULL_CANOPY;
  const grown = c.stage !== 'seed' && c.stage !== 'sprout';
  const o = SIGNATURE_PALETTE.opacity;
  const grass = mix(lighting.ground, SIGNATURE_PALETTE.shadow, SIGNATURE_PALETTE.grass.shade);

  return (
    <>
      {c.glow ? (
        <Layer>
          <Defs>
            <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.glow.color} stopOpacity={colors.glow.opacity} />
              <Stop offset="1" stopColor={colors.glow.color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={c.glow.cx} cy={c.glow.cy} r={c.glow.r} fill={`url(#${glowId})`} />
        </Layer>
      ) : null}

      {/* Ground shadow, mound, roots, trunk, and the details that sit on them: never moving. */}
      <Layer>
        <Defs>
          <RadialGradient id={poolId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={lighting.pool.color} stopOpacity={1} />
            <Stop offset="1" stopColor={lighting.pool.color} stopOpacity={0} />
          </RadialGradient>
          {/* The soil mound fades into the ground at its edge, lit from the upper left. */}
          {/* A grown tree stands in grass: only a little earth shows at its foot (ART.10). */}
          <RadialGradient id={moundId} cx="44%" cy="30%" r="62%">
            {(grown
              ? [
                  mix(lighting.ground, colors.soil, 0.35),
                  mix(lighting.ground, colors.soil, 0.12),
                  lighting.ground,
                ]
              : [barkVolume(colors.soil).light, colors.soil, lighting.ground]
            ).map((color, i) => (
              <Stop key={i} offset={grown ? [0, 0.45, 1][i] : [0, 0.5, 1][i]} stopColor={color} />
            ))}
          </RadialGradient>
          {box ? (
            <LinearGradient
              id={trunkShadeId}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={box.y + box.height - 8}
              x2={0}
              y2={box.y + box.height + 30}
            >
              <Stop offset="0" stopColor={SIGNATURE_PALETTE.shadow} stopOpacity={o.trunkShade} />
              <Stop offset="1" stopColor={SIGNATURE_PALETTE.shadow} stopOpacity={0} />
            </LinearGradient>
          ) : null}
          <LinearGradient id={barkId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={bark.light} />
            <Stop offset="0.45" stopColor={colors.bark} />
            <Stop offset="1" stopColor={bark.dark} />
          </LinearGradient>
        </Defs>
        {/* Warm light gathered on the ground under the tree (layer 4). */}
        <SvgEllipse
          cx={W / 2 - 4}
          cy={c.mound.cy - 1}
          rx={Math.max(36, c.bounds.width * 0.62)}
          ry={11}
          fill={url(poolId)}
          opacity={lighting.pool.opacity}
        />
        <SvgEllipse
          cx={W / 2 + 6}
          cy={c.mound.cy - 2}
          rx={c.bounds.width * 0.42}
          ry={7}
          fill={SIGNATURE_PALETTE.shadow}
          opacity={SIGNATURE_PALETTE.opacity.shadow}
        />
        <Shape shape={c.mound} fill={url(moundId)} />
        {grown ? <GrassTufts mound={c.mound} seed={tree.seed} color={grass} /> : null}
        <G transform={c.mirrored ? MIRROR : undefined}>
          {c.roots ? (
            <Path
              d={c.roots}
              stroke={colors.roots}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />
          ) : null}
          {c.trunk ? <Path d={c.trunk} fill={url(barkId)} /> : null}
          {/* The canopy shades the top of the trunk (ART.10). */}
          {c.trunk && fullCanopy ? <Path d={c.trunk} fill={url(trunkShadeId)} /> : null}
        </G>
        {c.seed ? <Shape shape={c.seed} fill={colors.seed} /> : null}
        {fixedTraits.map((mark) => (
          <Decoration key={mark.key} mark={mark} colors={colors} />
        ))}
      </Layer>

      <Animated.View style={[StyleSheet.absoluteFill, pivot, motion.canopy]}>
        <Animated.View style={[StyleSheet.absoluteFill, motion.canopyReveal]}>
          <Layer>
            <G transform={c.mirrored ? MIRROR : undefined}>
              {c.branches.map((branch) => (
                <Path
                  key={branch.key}
                  d={branch.path}
                  stroke={mix(colors.bark, bark.dark, 0.5)}
                  strokeWidth={branch.width}
                  strokeLinecap="round"
                  fill="none"
                />
              ))}
            </G>
          </Layer>
          {/* Each foliage layer sways a little on its own, back least (docs/04 §5). */}
          <Animated.View style={[StyleSheet.absoluteFill, pivot, motion.back]}>
            <Layer>
              <Defs>
                <LeafLight id={leafId.back} color={colors.foliage.back} />
              </Defs>
              {/* The dark heart of the canopy: gaps between clusters read as depth, not sky. */}
              {/* One path, so the core costs one element however full the canopy is. */}
              {fullCanopy ? (
                <Path
                  d={c.foliage.main
                    .map((shape) =>
                      clusterOutline(
                        {
                          ...shape,
                          rx: shape.rx * SIGNATURE_PALETTE.coreSpread,
                          ry: shape.ry * SIGNATURE_PALETTE.coreSpread,
                        },
                        shape.key,
                      ),
                    )
                    .join(' ')}
                  fill={volume(colors.foliage.back).dark}
                  opacity={o.core}
                />
              ) : null}
              {c.foliage.back.map((shape) => (
                <Cluster key={shape.key} shape={shape} fill={url(leafId.back)} />
              ))}
            </Layer>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, pivot, motion.main]}>
            <Layer>
              <Defs>
                <LeafLight id={leafId.main} color={colors.foliage.main} />
                <LeafLight id={leafId.accent} color={colors.foliage.accent} />
                {fullCanopy
                  ? SIGNATURE_PALETTE.canopyLight.bands.map((by, band) => (
                      <LeafLight
                        key={band}
                        id={bandId('main', band)}
                        color={tone(colors.foliage.main, by)}
                      />
                    ))
                  : null}
              </Defs>
              {/* ART.10: one light across the canopy (bands), each cluster keeping its own form. */}
              {[...c.foliage.main, ...c.foliage.richness].map((shape) => (
                <Cluster
                  key={shape.key}
                  shape={shape}
                  fill={
                    box && fullCanopy && !shape.accent
                      ? url(bandId('main', bandOf(shape, box)))
                      : leaf(shape.accent)
                  }
                  rim={fullCanopy ? volume(colors.foliage.main).dark : undefined}
                />
              ))}
              {c.highlights.map((shape) => (
                <Cluster
                  key={shape.key}
                  shape={shape}
                  fill={colors.foliage.highlight}
                  opacity={SIGNATURE_PALETTE.opacity.highlight}
                />
              ))}
              {c.fruit.map((dot) => (
                <Fruit key={dot.key} dot={dot} shape={c.fruitShape} colors={colors} />
              ))}
            </Layer>
          </Animated.View>
        </Animated.View>

        {/* Blossoms sit on the main foliage, so they sway with it. */}
        <Animated.View style={[StyleSheet.absoluteFill, pivot, motion.mainBlossoms]}>
          <Animated.View style={[StyleSheet.absoluteFill, motion.blossoms]}>
            <Layer>
              {c.blossoms.map((dot) => (
                <Bloom key={dot.key} dot={dot} bloom={c.bloom} colors={colors} density={density} />
              ))}
            </Layer>
          </Animated.View>
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, pivot, motion.front]}>
          <Layer>
            <Defs>
              <LeafLight id={leafId.front} color={colors.foliage.front} />
            </Defs>
            {c.foliage.front.map((shape) => (
              <Cluster
                key={shape.key}
                shape={shape}
                fill={url(leafId.front)}
                rim={fullCanopy ? volume(colors.foliage.front).dark : undefined}
              />
            ))}
          </Layer>
        </Animated.View>

        {/* Traits and a rare variant's glints hang in the main foliage and sway with it. */}
        <Animated.View style={[StyleSheet.absoluteFill, pivot, motion.mainTraits]}>
          <Animated.View style={[StyleSheet.absoluteFill, motion.traits]}>
            <Layer>
              {canopyTraits.map((mark) => (
                <Decoration key={mark.key} mark={mark} colors={colors} />
              ))}
            </Layer>
          </Animated.View>
          {effects && c.effect ? (
            <View testID={`tree-effect-${c.effect}`} style={StyleSheet.absoluteFill}>
              <Layer>
                <SpeciesEffectArt composition={c} colors={colors} night={lighting.night} />
              </Layer>
            </View>
          ) : null}
        </Animated.View>
      </Animated.View>

      {particles.map((particle, index) => (
        <Particle
          key={particle.key}
          particle={particle}
          index={index}
          color={particle.kind === 'firefly' ? colors.firefly : colors.pollen}
          drift={motion.drift}
        />
      ))}
    </>
  );
});

/** How far apart particles' phases sit, so no two drift together. */
const PHASE_STEP = 0.37;
const TAU = Math.PI * 2;

/**
 * One particle: pollen or a petal drifts on a slow loop of its own phase; a firefly also glows
 * and softens (docs/04 §5). Still without a drift clock.
 */
function Particle({
  particle,
  index,
  color,
  drift,
}: {
  particle: { x: number; y: number; r: number; kind: string };
  index: number;
  color: string;
  drift: ParticleDrift | undefined;
}) {
  const phase = index * PHASE_STEP;
  const firefly = particle.kind === 'firefly';
  const distance = drift?.distance ?? 0;
  const clock = drift?.clock;
  const twinkle = drift?.twinkle;
  const style = useAnimatedStyle(() => {
    const t = clock ? clock.value : 0;
    const glow = twinkle ? twinkle.value : 0;
    return {
      transform: [
        { translateX: Math.cos((t + phase * 1.7) * TAU) * distance * 0.4 },
        { translateY: Math.sin((t + phase) * TAU) * distance },
      ],
      opacity: firefly && distance > 0 ? 0.55 + 0.45 * Math.sin((glow + phase) * TAU) : 1,
    };
  });
  // A small round view where the particle is, not a scene-sized SVG for one dot: the scene has
  // the view box's 5:6 proportions, so its share of the box is its share of the scene, and each
  // frame moves a few pixels instead of a full layer.
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: `${((particle.x - particle.r) / W) * 100}%`,
          top: `${((particle.y - particle.r) / H) * 100}%`,
          width: `${((2 * particle.r) / W) * 100}%`,
          aspectRatio: 1,
          borderRadius: radius.full,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/**
 * Sky, sun or moon, far hills, and ground: the scene's base environment (docs/10 §2), which the
 * Meadow background is. An equipped Misty Hills adds far hills in mist (docs/03 §7 layer 2).
 * Any other background id draws the base environment alone.
 */
export const Backdrop = memo(function Backdrop({
  lighting,
  background = null,
}: {
  lighting: LightingPreset;
  background?: string | null;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const skyId = `sky-${uid}`;
  const haloId = `halo-${uid}`;
  const mistId = `mist-${uid}`;
  const { celestial, mist } = lighting;
  const known = KNOWN_BACKGROUNDS.find((id) => id === background) ?? null;
  const e = ENVIRONMENT_PALETTE;
  const shade = (color: string) => mix(color, lighting.shade.color, lighting.shade.amount);
  return (
    <View testID={known ? `scene-background-${known}` : undefined} style={StyleSheet.absoluteFill}>
      <Layer>
        <Defs>
          <LinearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lighting.sky[0]} />
            <Stop offset="0.78" stopColor={lighting.sky[1]} />
          </LinearGradient>
          <RadialGradient id={haloId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={celestial.color} stopOpacity={0.55} />
            <Stop offset="1" stopColor={celestial.color} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={mistId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={mist.color} stopOpacity={0} />
            <Stop offset="0.55" stopColor={mist.color} stopOpacity={mist.opacity} />
            <Stop offset="1" stopColor={mist.color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill={`url(#${skyId})`} />
        <Circle cx={celestial.x} cy={celestial.y} r={celestial.r * 2.8} fill={`url(#${haloId})`} />
        <Circle cx={celestial.x} cy={celestial.y} r={celestial.r} fill={celestial.color} />
        {/* ART.10: soft clouds by day, on the side away from the sun. */}
        {lighting.daylight ? <Clouds sunX={celestial.x} lighting={lighting} /> : null}
        {/* ART.10: a hazier ridge behind the near hills gives the land depth. */}
        {known === 'misty-hills' ? null : (
          <Path
            d={`M0 206 Q64 184 128 198 T${W} 188 L${W} 232 L0 232 Z`}
            fill={mix(lighting.hills, lighting.sky[1], 0.5)}
            opacity={SIGNATURE_PALETTE.opacity.farHills}
          />
        )}
        {/* Far hills in mist sit behind the near hills (layer 2). */}
        {known === 'misty-hills' ? (
          <>
            <Path
              d={`M0 190 Q50 168 104 184 T${W} 176 L${W} 214 L0 214 Z`}
              fill={shade(e.farHills)}
            />
            <Rect x={0} y={176} width={W} height={34} fill={e.mist} opacity={e.mistOpacity} />
          </>
        ) : null}
        <Path
          d={`M0 214 Q60 190 120 204 T${W} 198 L${W} ${H} L0 ${H} Z`}
          fill={lighting.hills}
          opacity={SIGNATURE_PALETTE.opacity.hills}
        />
        {/* Haze at the horizon: the far land recedes so the tree reads first. */}
        <Rect x={0} y={190} width={W} height={56} fill={`url(#${mistId})`} />
        <Path d={`M0 246 Q120 238 ${W} 246 L${W} ${H} L0 ${H} Z`} fill={lighting.ground} />
      </Layer>
    </View>
  );
});

/** Two soft clouds, each a few overlapping ovals, away from the sun (ART.10). */
function Clouds({ sunX, lighting }: { sunX: number; lighting: LightingPreset }) {
  const left = sunX > W / 2;
  const color = mix(SIGNATURE_PALETTE.cloud, lighting.sky[1], 0.25);
  const cloud = (x: number, y: number, s: number) => (
    <G opacity={SIGNATURE_PALETTE.opacity.cloud}>
      <SvgEllipse cx={x} cy={y} rx={22 * s} ry={6 * s} fill={color} />
      <SvgEllipse cx={x - 8 * s} cy={y - 4 * s} rx={10 * s} ry={7 * s} fill={color} />
      <SvgEllipse cx={x + 5 * s} cy={y - 6 * s} rx={12 * s} ry={9 * s} fill={color} />
    </G>
  );
  return (
    <>
      {cloud(left ? 62 : W - 62, 46, 1)}
      {cloud(left ? 132 : W - 132, 96, 0.7)}
    </>
  );
}

/**
 * An equipped decoration on the ground in front of the tree (docs/03 §7 layer 17): beside the
 * mound, never on the tree, so it can never pass for something the tree earned. Any other id
 * draws nothing.
 */
export const GardenDecoration = memo(function GardenDecoration({
  decoration,
  lighting,
}: {
  decoration: string | null;
  lighting: LightingPreset;
}) {
  const known = KNOWN_DECORATIONS.find((id) => id === decoration) ?? null;
  if (!known) return null;
  const e = ENVIRONMENT_PALETTE;
  const shade = (color: string) => mix(color, lighting.shade.color, lighting.shade.amount);
  const y = GROUND_Y + 6;
  return (
    <View testID={`scene-decoration-${known}`} style={StyleSheet.absoluteFill}>
      <Layer>
        {known === 'mossy-stones' ? (
          <G>
            <SvgEllipse cx={30} cy={y} rx={9} ry={5} fill={shade(e.stone)} />
            <SvgEllipse cx={30} cy={y - 3} rx={7} ry={2.5} fill={shade(e.moss)} />
            <SvgEllipse cx={44} cy={y + 2} rx={6} ry={3.5} fill={shade(e.stoneShade)} />
            <SvgEllipse cx={210} cy={y + 1} rx={7} ry={4} fill={shade(e.stone)} />
            <SvgEllipse cx={210} cy={y - 2} rx={5} ry={2} fill={shade(e.moss)} />
          </G>
        ) : (
          <G>
            {lighting.daylight ? null : (
              <Circle
                cx={206}
                cy={y - 16}
                r={9}
                fill={e.lanternLight}
                opacity={e.lanternLightOpacity}
              />
            )}
            <Rect x={202} y={y - 8} width={8} height={10} fill={shade(e.lantern)} />
            <Rect x={199} y={y - 20} width={14} height={9} rx={1.5} fill={shade(e.lantern)} />
            <Rect x={203} y={y - 18} width={6} height={5} fill={e.lanternLight} />
            <Path d={`M197 ${y - 20} L206 ${y - 26} L215 ${y - 20} Z`} fill={shade(e.stoneShade)} />
          </G>
        )}
      </Layer>
    </View>
  );
});

/** A species' bloom expression at one blossom slot (docs/03 §9: each in its own idiom). */
const SINGLE_FLOWER = { flowers: 1, scale: 1 } as const;

function Bloom({
  dot,
  bloom,
  colors,
  density,
}: {
  dot: Dot;
  bloom: TreeComposition['bloom'];
  colors: SceneColors;
  density: { flowers: number; scale: number };
}) {
  switch (bloom) {
    case 'flowers': {
      // One flower, or a small cluster around the slot (a sakura's dense blossoms).
      const r = dot.r * (density.flowers > 1 ? density.scale * 0.72 : 1);
      const flowers = Array.from({ length: density.flowers }, (_, i) => {
        if (density.flowers === 1) return { x: dot.cx, y: dot.cy };
        const a = (i / density.flowers) * Math.PI * 2 - Math.PI / 2;
        return { x: dot.cx + Math.cos(a) * r * 0.95, y: dot.cy + Math.sin(a) * r * 0.95 };
      });
      return (
        <G>
          {flowers.map((f, i) => (
            <Circle key={`p${i}`} cx={f.x} cy={f.y} r={r} fill={colors.blossom} />
          ))}
          {flowers.map((f, i) => (
            <Circle key={`c${i}`} cx={f.x} cy={f.y} r={r * 0.36} fill={colors.blossomCenter} />
          ))}
        </G>
      );
    }
    case 'tips':
      // Fresh bright tips on a conifer.
      return (
        <SvgEllipse
          cx={dot.cx}
          cy={dot.cy}
          rx={dot.r * 0.45}
          ry={dot.r * 1.1}
          fill={colors.blossom}
          rotation={-20}
          origin={`${dot.cx}, ${dot.cy}`}
        />
      );
    case 'leaf-shift':
      // Warm leaves turning in the canopy.
      return (
        <SvgEllipse
          cx={dot.cx}
          cy={dot.cy}
          rx={dot.r * 1.25}
          ry={dot.r * 0.8}
          fill={colors.blossom}
          rotation={25}
          origin={`${dot.cx}, ${dot.cy}`}
        />
      );
    case 'buds':
      return <Circle cx={dot.cx} cy={dot.cy} r={dot.r * 0.7} fill={colors.blossom} />;
  }
}

/** A species' fruit at one fruit slot. */
function Fruit({
  dot,
  shape,
  colors,
}: {
  dot: Dot;
  shape: TreeComposition['fruitShape'];
  colors: SceneColors;
}) {
  const { cx, cy, r } = dot;
  switch (shape) {
    case 'acorn':
      return (
        <G>
          <SvgEllipse cx={cx} cy={cy + r * 0.3} rx={r * 0.8} ry={r} fill={colors.fruit} />
          <SvgEllipse cx={cx} cy={cy - r * 0.55} rx={r} ry={r * 0.45} fill={colors.fruitCap} />
        </G>
      );
    case 'cherry':
      return (
        <G>
          <Path
            d={`M${cx} ${cy - r * 1.6} L${cx - r * 0.6} ${cy} M${cx} ${cy - r * 1.6} L${cx + r * 0.6} ${cy}`}
            stroke={colors.fruitCap}
            strokeWidth={0.8}
          />
          <Circle cx={cx - r * 0.6} cy={cy} r={r * 0.6} fill={colors.fruit} />
          <Circle cx={cx + r * 0.6} cy={cy} r={r * 0.6} fill={colors.fruit} />
        </G>
      );
    case 'cone':
      return <SvgEllipse cx={cx} cy={cy} rx={r * 0.6} ry={r * 1.1} fill={colors.fruit} />;
    case 'samara':
      return (
        <G>
          <SvgEllipse
            cx={cx - r * 0.5}
            cy={cy}
            rx={r}
            ry={r * 0.35}
            fill={colors.fruit}
            rotation={30}
            origin={`${cx}, ${cy}`}
          />
          <SvgEllipse
            cx={cx + r * 0.5}
            cy={cy}
            rx={r}
            ry={r * 0.35}
            fill={colors.fruit}
            rotation={-30}
            origin={`${cx}, ${cy}`}
          />
        </G>
      );
    case 'berry':
      return <Circle cx={cx} cy={cy} r={r * 0.75} fill={colors.fruit} />;
  }
}

/**
 * A rare variant's effect (docs/03 §9 → Rare trees): small static glints on the canopy (golden
 * light, frost, or a soft luminous edge that shows more at night). Never a glow behind the tree,
 * which is richness's, and never a new element in the tree's slots.
 */
function SpeciesEffectArt({
  composition: c,
  colors,
  night,
}: {
  composition: TreeComposition;
  colors: SceneColors;
  night: boolean;
}) {
  const clusters =
    c.effect === 'ancient-frost' ? [...c.foliage.back, ...c.foliage.main] : c.foliage.main;
  const opacity = c.effect === 'luminous' ? (night ? 0.9 : 0.45) : 0.8;
  return (
    <>
      {clusters.map((cluster) => (
        <Circle
          key={`${cluster.key}-effect`}
          cx={cluster.cx - cluster.rx * 0.3}
          cy={cluster.cy - cluster.ry * 0.55}
          r={c.effect === 'ancient-frost' ? 1.4 : 1.7}
          fill={colors.effect}
          opacity={opacity}
        />
      ))}
    </>
  );
}

/** The scene light over everything (docs/03 §7 layer 19): warmth follows vitality. */
export function LightOverlay({ color, opacity }: SceneColors['light']) {
  return (
    <Layer>
      <Rect x={0} y={0} width={W} height={H} fill={color} opacity={opacity} />
    </Layer>
  );
}

/** Placeholder milestone decorations (docs/10 §2): small, distinct, recognizable objects. */
function Decoration({ mark, colors }: { mark: TraitMark; colors: SceneColors }) {
  const { x, y, size: s } = mark;
  const color = colors.decorations[mark.decoration];
  const hang = mark.anchor === 'canopy';
  switch (mark.decoration) {
    case 'hanging-bloom':
      return (
        <G>
          {hang ? (
            <Path d={`M${x} ${y - s} L${x} ${y - s * 0.4}`} stroke={colors.bark} strokeWidth={1} />
          ) : null}
          <Circle cx={x} cy={y} r={s * 0.55} fill={color} />
          <Circle cx={x} cy={y} r={s * 0.2} fill={colors.blossomCenter} />
        </G>
      );
    case 'songbird-nest':
      return (
        <G>
          <SvgEllipse cx={x} cy={y} rx={s} ry={s * 0.55} fill={color} />
          <SvgEllipse cx={x} cy={y - s * 0.2} rx={s * 0.65} ry={s * 0.25} fill={colors.bark} />
        </G>
      );
    case 'vine-ribbon':
      return (
        <G>
          <Path
            d={`M${x - s} ${y} Q${x} ${y - s} ${x + s} ${y}`}
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
            fill="none"
          />
          <SvgEllipse cx={x - s * 0.5} cy={y - s * 0.45} rx={s * 0.3} ry={s * 0.18} fill={color} />
          <SvgEllipse cx={x + s * 0.5} cy={y - s * 0.45} rx={s * 0.3} ry={s * 0.18} fill={color} />
        </G>
      );
    case 'lantern-flower':
      return (
        <G>
          <Circle cx={x} cy={y} r={s} fill={color} opacity={SIGNATURE_PALETTE.opacity.lantern} />
          {hang ? (
            <Path d={`M${x} ${y - s} L${x} ${y - s * 0.5}`} stroke={colors.bark} strokeWidth={1} />
          ) : null}
          <Rect
            x={x - s * 0.4}
            y={y - s * 0.5}
            width={s * 0.8}
            height={s}
            rx={s * 0.3}
            fill={color}
          />
        </G>
      );
    case 'seedpod':
      return (
        <G>
          {hang ? (
            <Path d={`M${x} ${y - s} L${x} ${y - s * 0.7}`} stroke={colors.bark} strokeWidth={1} />
          ) : null}
          <SvgEllipse cx={x} cy={y} rx={s * 0.4} ry={s * 0.75} fill={color} />
        </G>
      );
    case 'heartwood-ring':
      return (
        <SvgEllipse
          cx={x}
          cy={y}
          rx={s * 0.6}
          ry={s * 0.45}
          stroke={color}
          strokeWidth={1.5}
          fill="none"
        />
      );
    case 'golden-leaf':
      return (
        <SvgEllipse
          cx={x}
          cy={y}
          rx={s}
          ry={s * 0.5}
          fill={color}
          rotation={-25}
          origin={`${x}, ${y}`}
        />
      );
    case 'event-ribbon':
      // A small tied ribbon: two loops and a knot.
      return (
        <>
          <SvgEllipse
            cx={x - s * 0.45}
            cy={y}
            rx={s * 0.5}
            ry={s * 0.3}
            fill={color}
            rotation={20}
            origin={`${x}, ${y}`}
          />
          <SvgEllipse
            cx={x + s * 0.45}
            cy={y}
            rx={s * 0.5}
            ry={s * 0.3}
            fill={color}
            rotation={-20}
            origin={`${x}, ${y}`}
          />
          <Circle cx={x} cy={y} r={s * 0.2} fill={color} />
        </>
      );
  }
}
