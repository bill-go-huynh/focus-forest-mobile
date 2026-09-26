import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal as NativeModal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFontScale, useReducedMotion } from '../accessibility';
import { useTheme, type Theme } from '../theme';
import { requireText } from './PressableSurface';

/**
 * The shared foundation of Sheet, Modal, and Confirmation (docs/01_DESIGN_SYSTEM.md §8 →
 * Modals and sheets). Internal to src/components.
 *
 * Accessibility, and where the platform sets the limits:
 * - The native Modal presents in its own window (a view controller on iOS, a dialog on
 *   Android), so screen readers cannot reach the screen behind it. The panel is also
 *   marked accessibilityViewIsModal for iOS.
 * - On open, screen-reader focus moves to the title. On close, it returns to
 *   `returnFocusRef` if one is given. React Native offers no keyboard focus trap or
 *   keyboard focus return; these apply to screen-reader focus only.
 * - Back (Android), the screen-reader escape gesture (iOS), and the backdrop all ask to close.
 * - Sheets have no grab handle until drag-to-dismiss exists: a handle that cannot be
 *   dragged would be a false affordance.
 */

export type OverlayPresentation = 'sheet' | 'modal';

export interface OverlayProps {
  visible: boolean;
  /** Called by back, escape, and the backdrop. The parent decides by updating `visible`. */
  onRequestClose: () => void;
  /** Shown as the heading, and the name of the overlay. */
  title: string;
  presentation: OverlayPresentation;
  /** false for choices that must be made explicitly (default true). */
  dismissOnBackdropPress?: boolean;
  /** The control that opened the overlay. Screen-reader focus returns to it on close. */
  returnFocusRef?: RefObject<View | null>;
  /** Placed beside the title, such as the sheet's close button. */
  headerAction?: ReactNode;
  children: ReactNode;
  testID?: string;
}

function panelStyle(
  theme: Theme,
  presentation: OverlayPresentation,
  limits: { windowHeight: number; top: number; bottom: number },
): ViewStyle {
  const { space, radius } = theme;
  const shared: ViewStyle = {
    backgroundColor: theme.colors.surface.elevated,
    gap: space[4],
    ...theme.elevation[3],
  };
  if (presentation === 'sheet') {
    return {
      ...shared,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: space[5],
      paddingTop: space[3],
      paddingBottom: space[5] + limits.bottom,
      maxHeight: limits.windowHeight - limits.top - space[8],
    };
  }
  return {
    ...shared,
    borderRadius: radius.xl,
    padding: space[6],
    maxHeight: limits.windowHeight - limits.top - limits.bottom - space[10],
  };
}

export function Overlay({
  visible,
  onRequestClose,
  title,
  presentation,
  dismissOnBackdropPress = true,
  returnFocusRef,
  headerAction,
  children,
  testID,
}: OverlayProps) {
  const theme = useTheme();
  const { colors, space } = theme;
  requireText(title, 'title', 'Overlay');
  const reducedMotion = useReducedMotion();
  const { isLargeText } = useFontScale();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [progress] = useState(() => new Animated.Value(0));
  const titleRef = useRef<Text>(null);
  const wasOpen = useRef(false);

  // Stay mounted through the exit transition; unmount once it has finished.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      wasOpen.current = true;
      Animated.timing(progress, {
        toValue: 1,
        duration: theme.motion.base,
        easing: Easing.bezier(...theme.easing.enter),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && titleRef.current) {
          AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus');
        }
      });
    } else if (wasOpen.current) {
      Animated.timing(progress, {
        toValue: 0,
        duration: theme.motion.base,
        easing: Easing.bezier(...theme.easing.exit),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, progress, theme.motion.base, theme.easing.enter, theme.easing.exit]);

  // Return focus after the native modal is gone, on the next frame, so the screen
  // behind it is accessible again when focus arrives.
  useEffect(() => {
    if (mounted || !wasOpen.current) return;
    wasOpen.current = false;
    const target = returnFocusRef?.current;
    if (!target) return;
    const frame = requestAnimationFrame(() =>
      AccessibilityInfo.sendAccessibilityEvent(target, 'focus'),
    );
    return () => cancelAnimationFrame(frame);
  }, [mounted, returnFocusRef]);

  // Sheets slide up; under reduced motion, and always for centered modals, they only fade.
  const slides = presentation === 'sheet' && !reducedMotion;
  const motionStyle = slides
    ? {
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [windowHeight, 0],
            }),
          },
        ],
      }
    : { opacity: progress };

  return (
    <NativeModal
      transparent
      animationType="none"
      statusBarTranslucent
      visible={mounted}
      onRequestClose={onRequestClose}
    >
      <View
        testID="overlay-container"
        style={{
          flex: 1,
          justifyContent: presentation === 'sheet' ? 'flex-end' : 'center',
          paddingHorizontal: presentation === 'modal' ? space[5] : space[0],
        }}
      >
        <AnimatedPressable
          testID="overlay-backdrop"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          onPress={dismissOnBackdropPress ? onRequestClose : undefined}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.overlay.scrim, opacity: progress },
          ]}
        />
        <Animated.View
          testID={testID ?? 'overlay-panel'}
          accessibilityViewIsModal
          accessibilityLabel={title}
          onAccessibilityEscape={onRequestClose}
          style={[
            panelStyle(theme, presentation, {
              windowHeight,
              top: insets.top,
              bottom: insets.bottom,
            }),
            motionStyle,
          ]}
        >
          <View
            testID="overlay-header"
            style={{
              flexDirection: isLargeText ? 'column' : 'row',
              alignItems: isLargeText ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              gap: space[3],
            }}
          >
            {/* No numberOfLines: the title wraps at large sizes instead of truncating. */}
            <Text
              ref={titleRef}
              accessibilityRole="header"
              style={[theme.type.headline, { color: colors.text.primary, flexShrink: 1 }]}
            >
              {title}
            </Text>
            {headerAction}
          </View>
          {/* Scrolls when large text makes the content taller than the panel. */}
          <ScrollView
            testID="overlay-scroll"
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: space[4] }}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </NativeModal>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The supporting sentence under a modal's or confirmation's title. */
export function OverlayMessage({ text }: { text: string }) {
  const theme = useTheme();
  return <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>{text}</Text>;
}
