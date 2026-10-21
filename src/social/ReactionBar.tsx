import { View } from 'react-native';

import { REACTIONS, type ReactionKind } from '../api';
import { Chip } from '../components/Chip';
import { InlineStatus } from '../components/InlineStatus';
import { useTheme } from '../theme';
import { useReact, useReactions } from './queries';
import { REACTION_EMOJI, REACTION_NAME, socialRefusal } from './social-format';

/**
 * Quiet, positive reactions on a tree, a forest, or a badge (spec §13.4, docs/02 Social): five
 * kinds, no comments. A press adds the viewer's reaction or takes it back; the counts are the
 * server's. Nothing shows until the summary has loaded, and a failed press changes nothing: a
 * refusal (too many) is said in words, a lost connection stays quiet.
 */
export function ReactionBar({ userId, target }: { userId: string; target: string }) {
  const theme = useTheme();
  const summary = useReactions(userId, target);
  const react = useReact(userId, target);
  if (!summary.data) return null;
  const { counts, mine } = summary.data;
  const refusal = socialRefusal(react.error, 'reaction');

  return (
    <View style={{ gap: theme.space[2] }}>
      <View
        testID={`reactions-${target}`}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}
      >
        {REACTIONS.map((kind: ReactionKind) => {
          const chosen = mine.includes(kind);
          return (
            <Chip
              key={kind}
              label={
                counts[kind] > 0 ? `${REACTION_EMOJI[kind]} ${counts[kind]}` : REACTION_EMOJI[kind]
              }
              accessibilityLabel={`${REACTION_NAME[kind]}, ${counts[kind]}`}
              selected={chosen}
              disabled={react.isPending}
              onPress={() => react.mutate({ reaction: kind, on: !chosen })}
            />
          );
        })}
      </View>
      {refusal ? <InlineStatus tone="attention" message={refusal} live /> : null}
    </View>
  );
}
