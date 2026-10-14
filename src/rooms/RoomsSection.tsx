import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { NetworkError, roomErrorCode, type Room } from '../api';
import { FormMessage } from '../auth';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Input } from '../components/Input';
import { ListRow } from '../components/ListRow';
import { Sheet } from '../components/Sheet';
import { useTheme } from '../theme';
import { useCreateRoom, useCurrentRoom, useJoinRoom, useLobbies } from './queries';
import { RoomInvitesList } from './RoomInvites';

const DURATIONS = [15, 25, 50, 90] as const;
const SIZES = [2, 4, 6, 10] as const;
const NAME_MAX = 50;

/** Why a room could not be joined, by the server's code (A5.4). */
export function describeJoinError(error: unknown): string {
  if (error instanceof NetworkError) return "We couldn't reach the room. Check your connection.";
  switch (roomErrorCode(error)) {
    case 'rate_limited':
      return 'Too many codes tried for now. Please wait a few minutes and try again.';
    case 'room_not_found':
      return 'No open room has that code.';
    case 'room_full':
      return 'That room is full.';
    case 'room_started':
      return 'That room has already started.';
    case 'already_in_room':
      return "You're already in a room. Leave it first.";
    default:
      return "We couldn't join that room. Please try again.";
  }
}

/**
 * Focus rooms in Together (docs/05 → Together → Focus rooms): the room the user is in, the open
 * public rooms, creating one, and joining one by its code. Only state: no chat (spec §14.3).
 */
export function RoomsSection() {
  const theme = useTheme();
  const router = useRouter();
  const current = useCurrentRoom();
  const lobbies = useLobbies();
  const join = useJoinRoom();
  const [sheet, setSheet] = useState<'create' | 'code' | null>(null);
  const open = (room: Room) => router.push(`/together/room/${room.id}`);
  const mine = current.data?.room ?? null;
  const others = (lobbies.data?.items ?? []).filter((room) => room.id !== mine?.id);

  return (
    <View style={{ gap: theme.space[2] }}>
      <Text
        accessibilityRole="header"
        style={[theme.type.headline, { color: theme.colors.text.primary }]}
      >
        Focus rooms
      </Text>
      {/* Invitations from friends to rooms still gathering (M6.2). */}
      <RoomInvitesList />
      {mine ? (
        <ListRow
          title={`You're in ${mine.name}`}
          subtitle="Open the room"
          onPress={() => open(mine)}
        />
      ) : null}
      {others.map((room) => (
        <ListRow
          key={room.id}
          title={room.name}
          subtitle={`${room.durationMinutes} minutes, ${room.participants.length} of ${room.maxParticipants}${room.topic ? ` · ${room.topic}` : ''}`}
          disabled={join.isPending}
          onPress={() => join.mutate({ roomId: room.id }, { onSuccess: open })}
        />
      ))}
      {join.isError ? <FormMessage message={describeJoinError(join.error)} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        <Button variant="secondary" label="Create a room" onPress={() => setSheet('create')} />
        <Button variant="tertiary" label="Join with a code" onPress={() => setSheet('code')} />
      </View>
      <CreateRoomSheet
        visible={sheet === 'create'}
        onClose={() => setSheet(null)}
        onCreated={open}
      />
      <JoinCodeSheet visible={sheet === 'code'} onClose={() => setSheet(null)} onJoined={open} />
    </View>
  );
}

function CreateRoomSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (room: Room) => void;
}) {
  const theme = useTheme();
  const create = useCreateRoom();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [minutes, setMinutes] = useState<number>(25);
  const [size, setSize] = useState<number>(4);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const trimmed = name.trim();

  return (
    <Sheet visible={visible} title="Create a room" onRequestClose={onClose}>
      <View style={{ gap: theme.space[3] }}>
        <Input label="Room name" value={name} onChangeText={setName} maxLength={NAME_MAX} />
        <Input
          label="Room topic (optional)"
          helper="A label for the room. Everyone focuses on their own topic."
          value={topic}
          onChangeText={setTopic}
          maxLength={NAME_MAX}
        />
        <Choices
          label="Length"
          options={DURATIONS.map((value) => ({ value, label: `${value} min` }))}
          value={minutes}
          onChange={setMinutes}
        />
        <Choices
          label="People"
          options={SIZES.map((value) => ({ value, label: `Up to ${value}` }))}
          value={size}
          onChange={setSize}
        />
        <Choices
          label="Who can join"
          options={[
            { value: 'public' as const, label: 'Public' },
            { value: 'private' as const, label: 'Private' },
          ]}
          value={visibility}
          onChange={setVisibility}
        />
        {create.isError ? (
          <FormMessage
            message={
              roomErrorCode(create.error) === 'already_in_room'
                ? "You're already in a room. Leave it first."
                : "We couldn't create the room. Please try again."
            }
          />
        ) : null}
        <Button
          variant="primary"
          label="Create room"
          disabled={trimmed === '' || create.isPending}
          onPress={() =>
            create.mutate(
              {
                name: trimmed,
                topic: topic.trim() || null,
                durationMinutes: minutes,
                maxParticipants: size,
                visibility,
              },
              {
                onSuccess: (room) => {
                  onClose();
                  onCreated(room);
                },
              },
            )
          }
        />
      </View>
    </Sheet>
  );
}

function JoinCodeSheet({
  visible,
  onClose,
  onJoined,
}: {
  visible: boolean;
  onClose: () => void;
  onJoined: (room: Room) => void;
}) {
  const theme = useTheme();
  const join = useJoinRoom();
  const [code, setCode] = useState('');
  const normalized = code.trim().toUpperCase();

  return (
    <Sheet visible={visible} title="Join with a code" onRequestClose={onClose}>
      <View style={{ gap: theme.space[3] }}>
        <Input
          label="Room code"
          value={code}
          onChangeText={setCode}
          maxLength={6}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {join.isError ? <FormMessage message={describeJoinError(join.error)} /> : null}
        <Button
          variant="primary"
          label="Join room"
          disabled={normalized.length !== 6 || join.isPending}
          onPress={() =>
            join.mutate(
              { code: normalized },
              {
                onSuccess: (room) => {
                  onClose();
                  onJoined(room);
                },
              },
            )
          }
        />
      </View>
    </Sheet>
  );
}

function Choices<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text style={[theme.type.label, { color: theme.colors.text.primary }]}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        {options.map((option) => (
          <Chip
            key={String(option.value)}
            label={option.label}
            selected={option.value === value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </View>
  );
}
