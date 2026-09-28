import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { announce, useFontScale } from '../accessibility';
import { useTheme, type Theme } from '../theme';
import { Button } from './Button';
import { assertCalmCopy } from './calm-copy';
import { requireText } from './PressableSurface';

/**
 * A calm inline status (docs/01 §9, docs/02: no shame): for states such as "saved on this
 * device", "showing saved data", or something that needs a look. Not a toast and not an error
 * screen. The words carry the meaning; each tone also has its own shape, and its color only
 * tints that shape (docs/11: never color alone). Callers map their own states to a tone.
 */
export type InlineStatusTone = 'neutral' | 'info' | 'attention';

export interface InlineStatusProps {
  /** neutral: waiting or saved. info: context, such as cached data. attention: needs a look. */
  tone: InlineStatusTone;
  /** What is going on, in plain words. */
  message: string;
  /** Optional reassurance or next step, such as "Nothing is lost." */
  detail?: string;
  /** At most one action, as its own low-emphasis button. */
  action?: { label: string; onPress: () => void; accessibilityHint?: string };
  /** Announce it when it appears or its wording changes (for a status that arrives later). */
  live?: boolean;
  testID?: string;
}

function toneColor(theme: Theme, tone: InlineStatusTone): string {
  if (tone === 'info') return theme.colors.info;
  if (tone === 'attention') return theme.colors.warning;
  return theme.colors.text.muted;
}

// A clock (waiting), an "i" (context), an "!" (needs a look), on a 24-unit grid.
const MARKS: Record<InlineStatusTone, string> = {
  neutral: 'M12 8 V12 L14.5 14.5',
  info: 'M12 11 V16 M12 8 V8.01',
  attention: 'M12 7.5 V12.5 M12 16 V16.01',
};

function ToneGlyph({ tone }: { tone: InlineStatusTone }) {
  const theme = useTheme();
  const line = {
    stroke: toneColor(theme, tone),
    strokeWidth: theme.lineIcon.strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    // Decorative: the message says what the tone means.
    <View
      testID={`inline-status-glyph-${tone}`}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Svg width={theme.icon.md} height={theme.icon.md} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={9} {...line} />
        <Path d={MARKS[tone]} {...line} />
      </Svg>
    </View>
  );
}

export function InlineStatus({
  tone,
  message,
  detail,
  action,
  live = false,
  testID,
}: InlineStatusProps) {
  const theme = useTheme();
  const { colors, space, type } = theme;
  const { isLargeText } = useFontScale();
  requireText(message, 'message', 'InlineStatus');
  assertCalmCopy(message, 'InlineStatus');
  if (detail) assertCalmCopy(detail, 'InlineStatus');

  const spoken = detail ? `${message} ${detail}` : message;

  // Read once when it appears, and again only when its wording changes.
  useEffect(() => {
    if (live) announce(spoken);
  }, [live, spoken]);

  return (
    <View
      testID={testID}
      style={{
        // At 200% the action moves under the text, so neither is squeezed.
        flexDirection: isLargeText ? 'column' : 'row',
        alignItems: isLargeText ? 'flex-start' : 'center',
        gap: space[3],
        paddingVertical: space[3],
        paddingHorizontal: space[4],
        borderRadius: theme.radius.md,
        backgroundColor: colors.surface.sunken,
      }}
    >
      {/* Read as one element; the action stays separately focusable. */}
      <View
        accessible
        accessibilityLabel={spoken}
        accessibilityLiveRegion={live ? 'polite' : undefined}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3], flexShrink: 1 }}
      >
        <ToneGlyph tone={tone} />
        {/* No numberOfLines: text wraps at large sizes instead of truncating. */}
        <View style={{ flexShrink: 1, gap: space[1] }}>
          <Text style={[type.body, { color: colors.text.primary }]}>{message}</Text>
          {detail ? (
            <Text style={[type.caption, { color: colors.text.secondary }]}>{detail}</Text>
          ) : null}
        </View>
      </View>
      {action ? (
        <Button
          variant="tertiary"
          label={action.label}
          onPress={action.onPress}
          accessibilityHint={action.accessibilityHint}
        />
      ) : null}
    </View>
  );
}
