import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { Avatar } from '../components/Avatar';
import { useTheme } from '../theme';
import { KNOWN_PROFILE_FRAMES } from '../tree/environment';
import { ENVIRONMENT_PALETTE } from '../tree/species/palette';
import { useEquipment } from './queries';

/**
 * The profile avatar in the equipped profile frame (docs/10 → Profile frames: a subtle ring
 * that echoes the nature motifs). Presentation only, on Profile only: never on a tree, the
 * forest, or a recap. PROVISIONAL art (ART.5, direction B): a twig ring with leaves and a bud,
 * like its Collection Book mark; final with the other cosmetics at the quality gate.
 */
/** Leaves along the ring: their angle on it and how they turn from it, in degrees. */
const LEAVES = [
  [-55, 60],
  [-35, 120],
  [125, 60],
  [145, 120],
] as const;
/** Where the bud sits on the ring, in radians. */
const BUD = (25 * Math.PI) / 180;

export function FramedAvatar({ initials }: { initials: string | null }) {
  const theme = useTheme();
  const frame = useEquipment().data?.profileFrame?.id ?? null;
  const known = KNOWN_PROFILE_FRAMES.find((id) => id === frame) ?? null;
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
          {LEAVES.map(([angle, turn]) => {
            const a = (angle * Math.PI) / 180;
            const x = c + r * Math.cos(a);
            const y = c + r * Math.sin(a);
            return (
              <Ellipse
                key={angle}
                cx={x}
                cy={y}
                rx={ring * 0.75}
                ry={ring * 0.32}
                fill={e.frameLeaf}
                rotation={angle + turn}
                origin={`${x}, ${y}`}
              />
            );
          })}
          <Circle
            cx={c + r * Math.cos(BUD)}
            cy={c + r * Math.sin(BUD)}
            r={ring * 0.3}
            fill={e.frameBud}
          />
        </Svg>
      </View>
      <View style={{ position: 'absolute', top: ring, left: ring }}>
        <Avatar initials={initials} />
      </View>
    </View>
  );
}
