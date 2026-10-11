import { Text } from 'react-native';

import { useTheme } from '../theme';
import { useRoom, useRoomLink } from './queries';

/**
 * Quiet presence during a room's session (docs/05 Timer: "In Focus Together, quiet participant
 * presence"): one line, how many people are focusing together. No names, no activity, no chat.
 */
export function RoomPresence({ sessionId }: { sessionId: string }) {
  const theme = useTheme();
  const link = useRoomLink();
  const roomId = link.data?.sessionId === sessionId ? link.data.roomId : null;
  const room = useRoom(roomId);
  if (!roomId || !room.data) return null;
  // Once a room starts, everyone still in it is focusing or done: the others left quietly.
  const together = room.data.participants.length;
  return (
    <Text style={[theme.type.caption, { color: theme.colors.text.secondary }]}>
      {`Focusing together · ${together} ${together === 1 ? 'person' : 'people'}`}
    </Text>
  );
}
