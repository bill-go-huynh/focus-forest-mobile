import { memo, useId, useMemo, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
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
import { SIGNATURE_PALETTE, type LightingPreset } from './signature/palette';
import { GROUND_Y, TREE_VIEWBOX } from './signature/stages';
import { ENVIRONMENT_PALETTE } from './species/palette';
import type { TreeVisualState } from './visual-state';

/**
 * The drawn layers of one tree (docs/03 §7), back to front, each a full-size SVG in the scene's
 * view box. Layers that move are wrapped in their own animated views, so motion runs on the UI
 * thread and the trunk never moves. Nothing here is accessible: the scene is one image.
 */

type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style'];

/** Animated styles for the moving layers; absent ones stay still. */
export interface TreeArtMotion {
  canopy?: AnimatedViewStyle;
  canopyReveal?: AnimatedViewStyle;
  front?: AnimatedViewStyle;
  blossoms?: AnimatedViewStyle;
  traits?: AnimatedViewStyle;
  particles?: AnimatedViewStyle;
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
  const glowId = `glow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const c = composition;
  const pivot: ViewStyle = {
    transformOrigin: `${(c.pivot.x / W) * 100}% ${(c.pivot.y / H) * 100}%`,
  };
  const leaf = (accent: boolean) => (accent ? colors.foliage.accent : colors.foliage.main);
  const fixedTraits = c.traits.filter((mark) => mark.anchor !== 'canopy');
  const canopyTraits = c.traits.filter((mark) => mark.anchor === 'canopy');

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
        <SvgEllipse
          cx={W / 2}
          cy={c.mound.cy - 2}
          rx={c.bounds.width * 0.42}
          ry={7}
          fill={SIGNATURE_PALETTE.shadow}
          opacity={SIGNATURE_PALETTE.opacity.shadow}
        />
        <Shape shape={c.mound} fill={colors.soil} />
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
          {c.trunk ? <Path d={c.trunk} fill={colors.bark} /> : null}
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
                  stroke={colors.bark}
                  strokeWidth={branch.width}
                  strokeLinecap="round"
                  fill="none"
                />
              ))}
            </G>
            {c.foliage.back.map((shape) => (
              <Shape key={shape.key} shape={shape} fill={colors.foliage.back} />
            ))}
            {c.foliage.main.map((shape) => (
              <Shape key={shape.key} shape={shape} fill={leaf(shape.accent)} />
            ))}
            {c.foliage.richness.map((shape) => (
              <Shape key={shape.key} shape={shape} fill={colors.foliage.main} />
            ))}
            {c.highlights.map((shape) => (
              <Shape
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

        <Animated.View style={[StyleSheet.absoluteFill, motion.blossoms]}>
          <Layer>
            {c.blossoms.map((dot) => (
              <Bloom key={dot.key} dot={dot} bloom={c.bloom} colors={colors} />
            ))}
          </Layer>
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, pivot, motion.front]}>
          <Layer>
            {c.foliage.front.map((shape) => (
              <Shape key={shape.key} shape={shape} fill={colors.foliage.front} />
            ))}
          </Layer>
        </Animated.View>

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

      {particles.length > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, motion.particles]}>
          <Layer>
            {particles.map((particle) => (
              <Circle
                key={particle.key}
                cx={particle.x}
                cy={particle.y}
                r={particle.r}
                fill={particle.kind === 'firefly' ? colors.firefly : colors.pollen}
              />
            ))}
          </Layer>
        </Animated.View>
      ) : null}
    </>
  );
});

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
  const skyId = `sky-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { celestial } = lighting;
  const known = KNOWN_BACKGROUNDS.find((id) => id === background) ?? null;
  const e = ENVIRONMENT_PALETTE;
  const shade = (color: string) => mix(color, lighting.shade.color, lighting.shade.amount);
  return (
    <View testID={known ? `scene-background-${known}` : undefined} style={StyleSheet.absoluteFill}>
      <Layer>
        <Defs>
          <LinearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lighting.sky[0]} />
            <Stop offset="1" stopColor={lighting.sky[1]} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill={`url(#${skyId})`} />
        <Circle cx={celestial.x} cy={celestial.y} r={celestial.r} fill={celestial.color} />
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
        <Path d={`M0 246 Q120 238 ${W} 246 L${W} ${H} L0 ${H} Z`} fill={lighting.ground} />
      </Layer>
    </View>
  );
});

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
function Bloom({
  dot,
  bloom,
  colors,
}: {
  dot: Dot;
  bloom: TreeComposition['bloom'];
  colors: SceneColors;
}) {
  switch (bloom) {
    case 'flowers':
      return (
        <G>
          <Circle cx={dot.cx} cy={dot.cy} r={dot.r} fill={colors.blossom} />
          <Circle cx={dot.cx} cy={dot.cy} r={dot.r * 0.4} fill={colors.blossomCenter} />
        </G>
      );
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
  }
}
