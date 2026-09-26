import type { ReactNode } from 'react';
import { Text, View, type ViewStyle } from 'react-native';

import { MIN_TOUCH_TARGET, useFontScale } from '../accessibility';
import { useTheme, type Theme } from '../theme';
import { PressableSurface, requireText, type IconRenderer } from './PressableSurface';

/**
 * List row primitive for history and topic lists (docs/01_DESIGN_SYSTEM.md §8 → Lists):
 * leading icon, main content, trailing meta or action.
 */

interface ListRowBaseProps {
  title: string;
  subtitle?: string;
  /** Trailing meta text, such as a duration. */
  meta?: string;
  /** Decorative leading icon; the text lines carry the meaning. */
  leading?: IconRenderer;
  testID?: string;
}

interface StaticListRowProps extends ListRowBaseProps {
  onPress?: undefined;
  /** A trailing control (for example an IconButton). It stays its own button. */
  action?: ReactNode;
}

interface TappableListRowProps extends ListRowBaseProps {
  onPress: () => void;
  accessibilityHint?: string;
  disabled?: boolean;
  disabledReason?: string;
  /** Not allowed: a tappable row with a button inside would nest two buttons. */
  action?: undefined;
}

export type ListRowProps = StaticListRowProps | TappableListRowProps;

function rowLayout(theme: Theme): ViewStyle {
  return {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[3],
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: theme.space[3],
    paddingHorizontal: theme.space[4],
    borderRadius: theme.radius.md,
  };
}

export function ListRow(props: ListRowProps) {
  const theme = useTheme();
  const { colors, type } = theme;
  const { isLargeText } = useFontScale();
  const { title, subtitle, meta, leading, testID } = props;
  requireText(title, 'title', 'ListRow');
  if (props.onPress !== undefined && props.action !== undefined) {
    throw new Error('ListRow is either tappable or has a trailing action, not both.');
  }

  const label = [title, subtitle, meta].filter(Boolean).join(', ');

  const leadingIcon = leading ? (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {leading({ color: colors.text.secondary, size: theme.icon.md })}
    </View>
  ) : null;

  // No numberOfLines anywhere: text wraps at large sizes instead of truncating.
  // At 200% the meta moves under the title, so neither is squeezed.
  const body = (
    <View
      testID={testID ? `${testID}-body` : undefined}
      style={{
        flex: 1,
        flexDirection: isLargeText ? 'column' : 'row',
        alignItems: isLargeText ? 'flex-start' : 'center',
        gap: isLargeText ? theme.space[1] : theme.space[3],
      }}
    >
      <View style={{ flexShrink: 1, flexGrow: 1 }}>
        <Text style={[type.body, { color: colors.text.primary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[type.caption, { color: colors.text.secondary }]}>{subtitle}</Text>
        ) : null}
      </View>
      {meta ? (
        <Text style={[type.caption, { color: colors.text.muted, flexShrink: 1 }]}>{meta}</Text>
      ) : null}
    </View>
  );

  if (props.onPress !== undefined) {
    return (
      <PressableSurface
        accessibilityLabel={label}
        accessibilityHint={props.accessibilityHint}
        onPress={props.onPress}
        disabled={props.disabled}
        disabledReason={props.disabledReason}
        testID={testID}
        layout={rowLayout(theme)}
        fill={{ pressed: colors.surface.sunken }}
      >
        {leadingIcon}
        {body}
      </PressableSurface>
    );
  }

  return (
    <View testID={testID} style={rowLayout(theme)}>
      {/* Read as one element; a trailing action stays separately focusable. */}
      <View
        accessible
        accessibilityLabel={label}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}
      >
        {leadingIcon}
        {body}
      </View>
      {props.action}
    </View>
  );
}
