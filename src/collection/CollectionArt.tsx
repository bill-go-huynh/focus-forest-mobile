import { useId } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import type { CollectionItem } from '../api';
import { BadgeMark } from '../progression/BadgeMark';
import { useTheme } from '../theme';
import { speciesPreview, TreeScene } from '../tree';
import { ENVIRONMENT_PALETTE } from '../tree/species/palette';

/**
 * An item's art in the Collection Book (docs/05: owned items in full art, locked items as quiet
 * silhouettes). Owned species are drawn by the renderer at Final Form, badges by their mark,
 * cosmetics by a small mark of what they add. A locked item is one muted shape of its kind:
 * nothing of its art is shown before it is earned. Decorative: the item's name is read instead.
 *
 * PROVISIONAL (ART.5, 2026-10-16): the cosmetic marks are drawn in direction B; the locked
 * silhouettes stay one quiet tone on purpose. Final when the owner passes the collection art
 * through the quality gate (docs/10 §4).
 */
export function CollectionArt({ item }: { item: CollectionItem }) {
  if (!item.owned) return <Silhouette item={item} />;
  switch (item.kind) {
    case 'species':
      // An example of the species, not the user's tree: never read as a description of it.
      return (
        <Hidden testID={`collection-species-${item.id}`}>
          <TreeScene
            tree={speciesPreview(item.id, 'final_form')}
            size="thumbnail"
            motion="still"
            active={false}
          />
        </Hidden>
      );
    case 'badge':
      return <BadgeMark badge={item} />;
    case 'cosmetic':
      return <CosmeticMark id={item.artworkId} type={item.type} />;
  }
}

/** The art box of a kind, so a section's grid stays uniform. */
export function useArtSize(kind: CollectionItem['kind']): { width: number; height: number } {
  const theme = useTheme();
  if (kind === 'species') {
    const width = theme.treeScene.thumbnail;
    return { width, height: width / theme.treeScene.aspectRatio };
  }
  return { width: theme.badge.mark, height: theme.badge.mark };
}

function Hidden({ testID, children }: { testID: string; children: React.ReactNode }) {
  return (
    <View
      testID={testID}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {children}
    </View>
  );
}

function Silhouette({ item }: { item: CollectionItem }) {
  const theme = useTheme();
  const { width, height } = useArtSize(item.kind);
  const fill = theme.colors.surface.sunken;
  return (
    <Hidden testID={`collection-silhouette-${item.id}`}>
      {item.kind === 'species' ? (
        <Svg width={width} height={height} viewBox="0 0 50 60">
          <Ellipse cx={25} cy={24} rx={18} ry={16} fill={fill} />
          <Rect x={22} y={34} width={6} height={20} rx={2} fill={fill} />
          <Ellipse cx={25} cy={56} rx={14} ry={2.5} fill={fill} />
        </Svg>
      ) : item.kind === 'badge' ? (
        <Svg width={width} height={height} viewBox="0 0 48 48">
          <Circle cx={24} cy={24} r={18} fill={fill} />
        </Svg>
      ) : (
        <Svg width={width} height={height} viewBox="0 0 48 48">
          <Rect x={8} y={8} width={32} height={32} rx={10} fill={fill} />
        </Svg>
      )}
    </Hidden>
  );
}

/**
 * A cosmetic's mark (ART.5, direction B): a small lit vignette of what it adds. A hill for a
 * background, a stone or lantern on the ground, a vine ring for a frame. An unknown cosmetic
 * draws the plain vignette.
 */
export const cosmeticArtStatus = 'provisional' as const;

// The ground follows the vignette's circle (center 24, 24; radius 22) below y = 30.
const GROUND = 'M2.8 30 Q24 22 45.2 30 A22 22 0 0 1 2.8 30 Z';
const leaf = (x: number, y: number, deg: number, len = 6) => {
  const a = (deg * Math.PI) / 180;
  const tip = [x + len * Math.cos(a), y + len * Math.sin(a)];
  const n = [-Math.sin(a) * len * 0.38, Math.cos(a) * len * 0.38];
  const m = [x + (len / 2) * Math.cos(a), y + (len / 2) * Math.sin(a)];
  const f = (v: number) => v.toFixed(1);
  return `M${f(x)} ${f(y)} Q${f(m[0]! + n[0]!)} ${f(m[1]! + n[1]!)} ${f(tip[0]!)} ${f(tip[1]!)} Q${f(m[0]! - n[0]!)} ${f(m[1]! - n[1]!)} ${f(x)} ${f(y)}Z`;
};

export function CosmeticMark({ id, type }: { id: string; type: string }) {
  const theme = useTheme();
  const e = ENVIRONMENT_PALETTE;
  const size = theme.badge.mark;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ids = {
    sky: `cm-${uid}-sky`,
    ground: `cm-${uid}-ground`,
    glow: `cm-${uid}-glow`,
    stone: `cm-${uid}-stone`,
  };
  const url = (key: keyof typeof ids) => `url(#${ids[key]})`;
  return (
    <Hidden testID={`cosmetic-mark-${id}`}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Defs>
          <LinearGradient id={ids.sky} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={e.vignette.sky[0]} />
            <Stop offset="1" stopColor={e.vignette.sky[1]} />
          </LinearGradient>
          <LinearGradient id={ids.ground} x1="0.2" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor={e.vignette.ground[0]} />
            <Stop offset="1" stopColor={e.vignette.ground[1]} />
          </LinearGradient>
          <RadialGradient id={ids.glow} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={e.lanternLight} stopOpacity={e.lanternLightOpacity} />
            <Stop offset="1" stopColor={e.lanternLight} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={ids.stone} cx="34%" cy="28%" r="80%">
            <Stop offset="0" stopColor={e.stone} />
            <Stop offset="1" stopColor={e.stoneShade} />
          </RadialGradient>
        </Defs>
        <Circle cx={24} cy={24} r={22} fill={url('sky')} />
        {type === 'background' && id === 'misty-hills' ? (
          <>
            <Path d="M3 27 Q14 17 26 24 Q36 18 45 25 L45.2 30 L2.8 30 Z" fill={e.farHills} />
            <Path d="M3 27 H45 V30 H3 Z" fill={e.mist} opacity={e.mistOpacity} />
          </>
        ) : null}
        <Path d={GROUND} fill={url('ground')} />
        {type === 'background' ? (
          <Path
            d="M14 36 q1 -3 3 -4 M22 38 q-1 -3 -3 -4 M30 36 q1 -3 3 -4"
            stroke={e.moss}
            strokeWidth={1.2}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
        {type === 'decoration' && id === 'stone-lantern' ? (
          <>
            <Circle cx={24} cy={22} r={12} fill={url('glow')} />
            <Rect x={22} y={27} width={4} height={8} fill={e.stoneShade} />
            <Rect x={19.5} y={18} width={9} height={9} rx={1.5} fill={e.lantern} />
            <Rect x={21.5} y={20} width={5} height={5} rx={1} fill={e.lanternLight} />
            <Path d="M17 18 L24 12.5 L31 18 Z" fill={e.stoneShade} />
          </>
        ) : null}
        {type === 'decoration' && id !== 'stone-lantern' ? (
          <>
            <Ellipse cx={19} cy={33} rx={8} ry={5} fill={url('stone')} />
            <Ellipse cx={30} cy={35} rx={6} ry={4} fill={url('stone')} />
            <Path d="M13 31 Q19 27 25 31 Q19 30 13 31 Z" fill={e.moss} />
            <Path d="M26 33.5 Q30 31 34 33.5 Q30 32.6 26 33.5 Z" fill={e.moss} />
          </>
        ) : null}
        {type === 'profile_frame' ? (
          <>
            <Circle cx={24} cy={24} r={13} stroke={e.frame} strokeWidth={2.4} fill="none" />
            <Path d={leaf(33, 14, -40)} fill={e.frameLeaf} />
            <Path d={leaf(35, 17, 10)} fill={e.frameLeaf} />
            <Path d={leaf(14, 34, 140)} fill={e.frameLeaf} />
            <Path d={leaf(12, 31, 190)} fill={e.frameLeaf} />
            <Circle cx={36.5} cy={30} r={1.8} fill={e.frameBud} />
          </>
        ) : null}
      </Svg>
    </Hidden>
  );
}
