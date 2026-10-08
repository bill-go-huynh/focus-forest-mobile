import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

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
 * PLACEHOLDER: the cosmetic marks and the silhouettes stand in for the collection art set
 * (docs/10); production art replaces them behind the same ids.
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

/** A cosmetic's mark: a hill for a background, a stone or lantern, a ring for a frame. */
function CosmeticMark({ id, type }: { id: string; type: string }) {
  const theme = useTheme();
  const e = ENVIRONMENT_PALETTE;
  const size = theme.badge.mark;
  return (
    <Hidden testID={`cosmetic-mark-${id}`}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx={24} cy={24} r={22} fill={theme.colors.surface.scene} />
        {type === 'background' ? (
          <>
            {id === 'misty-hills' ? (
              <Path d="M4 30 Q16 16 28 26 Q36 18 44 26 L44 34 L4 34 Z" fill={e.farHills} />
            ) : null}
            <Path
              d="M4 34 Q18 22 30 32 Q38 26 44 32 L44 40 L4 40 Z"
              fill={theme.colors.forest.soft}
            />
          </>
        ) : type === 'decoration' ? (
          id === 'stone-lantern' ? (
            <>
              <Rect x={20} y={20} width={8} height={10} rx={1} fill={e.lantern} />
              <Rect x={21} y={22} width={6} height={5} fill={e.lanternLight} />
              <Path d="M16 20 L24 13 L32 20 Z" fill={e.stoneShade} />
              <Rect x={22} y={30} width={4} height={8} fill={e.lantern} />
            </>
          ) : (
            <>
              <Ellipse cx={19} cy={33} rx={8} ry={5} fill={e.stone} />
              <Ellipse cx={30} cy={35} rx={6} ry={4} fill={e.stoneShade} />
              <Ellipse cx={19} cy={29} rx={5} ry={2} fill={e.moss} />
            </>
          )
        ) : type === 'profile_frame' ? (
          <>
            <Circle cx={24} cy={24} r={14} stroke={e.frame} strokeWidth={3} fill="none" />
            <Ellipse cx={34} cy={13} rx={4} ry={2} fill={e.frameLeaf} />
            <Ellipse cx={14} cy={35} rx={4} ry={2} fill={e.frameLeaf} />
          </>
        ) : null}
      </Svg>
    </Hidden>
  );
}
