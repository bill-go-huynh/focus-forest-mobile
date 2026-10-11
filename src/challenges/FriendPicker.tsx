import { Text, View } from 'react-native';

import { Chip } from '../components/Chip';
import { personName } from '../social/social-format';
import { useFollowing } from '../social/queries';
import { useTheme } from '../theme';

/**
 * Friends to invite: mutual follows only (A5.5 `not_a_friend` otherwise). Those already taking
 * part or invited are left out.
 */
export function FriendPicker({
  selected,
  onChange,
  exclude = [],
}: {
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  exclude?: readonly string[];
}) {
  const theme = useTheme();
  const following = useFollowing();
  const friends = (following.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (person) => person.relationship.friends && !exclude.includes(person.id),
  );

  return (
    <View style={{ gap: theme.space[2] }}>
      <Text style={[theme.type.label, { color: theme.colors.text.primary }]}>Invite friends</Text>
      {friends.length === 0 && following.data ? (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          Friends are people you follow who follow you back.
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        {friends.map((friend) => {
          const chosen = selected.includes(friend.id);
          return (
            <Chip
              key={friend.id}
              label={personName(friend)}
              selected={chosen}
              onPress={() =>
                onChange(
                  chosen ? selected.filter((id) => id !== friend.id) : [...selected, friend.id],
                )
              }
            />
          );
        })}
      </View>
    </View>
  );
}
