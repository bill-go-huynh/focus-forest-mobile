import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { NetworkError, roomErrorCode } from '../api';
import { FormMessage } from '../auth';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { FriendPicker } from '../challenges/FriendPicker';
import { personName } from '../social/social-format';
import { useTheme } from '../theme';
import { useDeclineRoomInvite, useInviteToRoom, useRoomInvites } from './queries';

/**
 * Invitations to rooms still gathering (M6.2; A6.3), at the top of Focus rooms: who invited
 * the user to which room, to open it (and join there) or decline. Nothing shows without any.
 */
export function RoomInvitesList() {
  const theme = useTheme();
  const router = useRouter();
  const invites = useRoomInvites();
  const decline = useDeclineRoomInvite();
  const items = invites.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <View style={{ gap: theme.space[2] }}>
      {items.map(({ room, from }) => (
        <View key={room.id} style={{ gap: theme.space[1] }}>
          <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>
            {`${personName(from)} invited you to ${room.name}`}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
            <Button
              variant="secondary"
              label="Open"
              accessibilityLabel={`Open ${room.name}`}
              onPress={() => router.push(`/together/room/${room.id}`)}
            />
            <Button
              variant="tertiary"
              label="Decline"
              accessibilityLabel={`Decline the invitation to ${room.name}`}
              disabled={decline.isPending}
              onPress={() => decline.mutate(room.id)}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Why friends could not be invited, by the server's code (A6.3). */
function describeInviteError(error: unknown): string {
  if (error instanceof NetworkError)
    return "We couldn't send the invitations. Check your connection.";
  switch (roomErrorCode(error)) {
    case 'not_a_friend':
      return 'Only friends (people who follow you back) can be invited.';
    case 'room_started':
      return 'The room has already started.';
    default:
      return "We couldn't send the invitations. Please try again.";
  }
}

/**
 * Inviting friends to the room the user is in, from its lobby (M6.2): mutual follows not
 * already there, chosen in a sheet. They are told by a notification if they turned it on.
 */
export function InviteFriends({
  roomId,
  present,
}: {
  roomId: string;
  /** People already in the room, not offered again. */
  present: readonly string[];
}) {
  const theme = useTheme();
  const invite = useInviteToRoom(roomId);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  return (
    <View style={{ gap: theme.space[2] }}>
      <Button
        variant="secondary"
        label="Invite friends"
        onPress={() => {
          setSent(false);
          invite.reset();
          setOpen(true);
        }}
      />
      {sent ? (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          Invitations sent.
        </Text>
      ) : null}
      <Sheet visible={open} onRequestClose={() => setOpen(false)} title="Invite friends">
        <View style={{ gap: theme.space[3] }}>
          <FriendPicker selected={chosen} onChange={setChosen} exclude={present} />
          {invite.isError ? <FormMessage message={describeInviteError(invite.error)} /> : null}
          <Button
            variant="primary"
            label="Send invitations"
            disabled={chosen.length === 0 || invite.isPending}
            disabledReason="Choose at least one friend."
            onPress={() =>
              invite.mutate(chosen, {
                onSuccess: () => {
                  setChosen([]);
                  setOpen(false);
                  setSent(true);
                },
              })
            }
          />
        </View>
      </Sheet>
    </View>
  );
}
