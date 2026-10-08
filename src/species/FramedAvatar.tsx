import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { Avatar } from '../components/Avatar';
import { useTheme } from '../theme';
import { ENVIRONMENT_PALETTE } from '../tree/species/palette';
import { useEquipment } from './queries';

/** Profile frames the app can draw; any other id draws the plain avatar. */
const KNOWN_FRAMES = ['twig-frame'] as const;

/**
 * The profile avatar in the equipped profile frame (docs/10 → Profile frames: a subtle ring
 * that echoes the nature motifs). Presentation only, on Profile only: never on a tree, the
 * forest, or a recap. PLACEHOLDER art, like the other cosmetics.
 */
export function FramedAvatar({ initials }: { initials: string | null }) {
  const theme = useTheme();
  const frame = useEquipment().data?.profileFrame?.id ?? null;
  const known = KNOWN_FRAMES.find((id) => id === frame) ?? null;
  if (!known) return <Avatar initials={initials} />;
  const inner = theme.avatar.lg;
  const ring = theme.space[2];
  const size = inner + ring * 2;
  const c = size / 2;
  const r = c - ring / 2;
  const e = ENVIRONMENT_PALETTE;
  return (
    <View style={{ width: size, height: size }}>
      <View
        testID={`avatar-frame-${known}`}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ position: 'absolute', width: size, height: size }}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={c} cy={c} r={r} stroke={e.frame} strokeWidth={ring * 0.5} fill="none" />
          <Path
            d={`M ${c - r * 0.9} ${c + r * 0.45} Q ${c - r} ${c} ${c - r * 0.8} ${c - r * 0.6}`}
            stroke={e.frame}
            strokeWidth={ring * 0.3}
            strokeLinecap="round"
            fill="none"
          />
          <Ellipse
            cx={c + r * 0.72}
            cy={c - r * 0.7}
            rx={ring * 0.7}
            ry={ring * 0.35}
            fill={e.frameLeaf}
          />
          <Ellipse
            cx={c - r * 0.75}
            cy={c + r * 0.7}
            rx={ring * 0.7}
            ry={ring * 0.35}
            fill={e.frameLeaf}
          />
        </Svg>
      </View>
      <View style={{ position: 'absolute', top: ring, left: ring }}>
        <Avatar initials={initials} />
      </View>
    </View>
  );
}
