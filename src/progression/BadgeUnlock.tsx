import { useEffect, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { useReducedMotion } from '../accessibility';
import { useTheme } from '../theme';
import { BadgeMark } from './BadgeMark';
import type { UnlockMoment } from './unlocks';

/** The badge art's start scale for its reveal (docs/04 → Badge unlock: "from ~90% to 100%"). */
const REVEAL_FROM_SCALE = 0.9;

/**
 * What an action unlocked (docs/02 Session completion, step 4; docs/04 → Badge unlock): the
 * featured badge fades and scales in once (`motion.reward`), never before the tree's own moment
 * (the caller shows it after), with its caption; the rest is one line of text. `reveal` false
 * describes it without motion (a moment shown before, or reduced motion: shown at once). No
 * confetti, no loop. The words carry the meaning with or without motion; announcing them is the
 * caller's, once.
 */
export function BadgeUnlock({ moment, reveal }: { moment: UnlockMoment; reveal: boolean }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const animate = reveal && !reducedMotion;
  const [progress] = useState(() => new Animated.Value(animate ? 0 : 1));
  useEffect(() => {
    if (!animate) return;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: theme.motion.reward,
      easing: Easing.bezier(...theme.easing.enter),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [animate, progress, theme.motion.reward, theme.easing.enter]);

  const { featured, caption, line } = moment;
  return (
    <View testID="badge-unlock" style={{ alignItems: 'center', gap: theme.space[2] }}>
      {featured ? (
        <Animated.View
          style={{
            opacity: progress,
            transform: [
              {
                scale: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [REVEAL_FROM_SCALE, 1],
                }),
              },
            ],
          }}
        >
          <BadgeMark badge={featured} size="reveal" />
        </Animated.View>
      ) : null}
      <Text
        style={[theme.type.headline, { color: theme.colors.text.primary, textAlign: 'center' }]}
      >
        {caption}
      </Text>
      {featured ? (
        <Text
          style={[theme.type.body, { color: theme.colors.text.secondary, textAlign: 'center' }]}
        >
          {featured.description}
        </Text>
      ) : null}
      {line ? (
        <Text
          style={[theme.type.body, { color: theme.colors.text.secondary, textAlign: 'center' }]}
        >
          {line}
        </Text>
      ) : null}
    </View>
  );
}
