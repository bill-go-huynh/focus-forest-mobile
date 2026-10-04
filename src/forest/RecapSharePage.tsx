import { useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import type { Recap } from '../api';
import { Button } from '../components/Button';
import { InlineStatus } from '../components/InlineStatus';
import { useTheme } from '../theme';
import { toTreeVisualState, TreeScene } from '../tree';
import { recapShareContent } from './recap-format';
import { shareRecapCard } from './recap-share';

/**
 * The recap's share page: the card that is captured and shared (the month, the final tree, its
 * stage, total focus, active days, and the longest streak), then Share. Notes are private and
 * are never on the card; there is no opt-in yet. The card is a still image: motion settings never
 * change what it says.
 */
export function RecapSharePage({ recap }: { recap: Recap }) {
  const theme = useTheme();
  const card = useRef<View>(null);
  const content = useMemo(() => recapShareContent(recap), [recap]);
  const tree = useMemo(() => toTreeVisualState(recap.tree), [recap.tree]);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const share = async () => {
    setBusy(true);
    setUnavailable(false);
    const outcome = await shareRecapCard(card, content);
    setUnavailable(outcome === 'unavailable');
    setBusy(false);
  };

  return (
    <>
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.secondary }]}
      >
        Share this month
      </Text>
      <View
        ref={card}
        testID="recap-share-card"
        collapsable={false}
        style={{
          gap: theme.space[2],
          alignItems: 'center',
          padding: theme.space[5],
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surface.primary,
        }}
      >
        <Text style={[theme.type.headline, { color: theme.colors.text.primary }]}>
          {content.title}
        </Text>
        <TreeScene tree={tree} size="thumbnail" motion="still" active={false} />
        {content.lines.map((line) => (
          <Text key={line} style={[theme.type.body, { color: theme.colors.text.primary }]}>
            {line}
          </Text>
        ))}
      </View>
      <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>
        Notes stay private and are never shared.
      </Text>
      <Button
        variant="primary"
        label="Share"
        onPress={() => void share()}
        disabled={busy}
        disabledReason="Preparing your card."
      />
      {unavailable ? (
        <InlineStatus tone="attention" message="Sharing isn't available right now." live />
      ) : null}
    </>
  );
}
