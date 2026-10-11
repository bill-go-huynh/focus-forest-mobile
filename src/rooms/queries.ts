import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  completeRoom,
  createRoom,
  getCurrentRoom,
  getRoom,
  joinRoom,
  joinRoomByCode,
  leaveRoom,
  listRooms,
  setRoomReady,
  startRoom,
  useApi,
  useSession,
  type NewRoom,
  type Room,
} from '../api';
import { readRoomLink } from './room-links';

export const roomKeys = {
  all: ['rooms'] as const,
  lobbies: ['rooms', 'lobbies'] as const,
  current: ['rooms', 'current'] as const,
  room: (roomId: string) => ['rooms', 'room', roomId] as const,
  link: (userId: string | null) => ['rooms', 'link', userId] as const,
};

/** How often a room is read again while it is open: the live channel usually comes first. */
const ROOM_REFRESH_MS = 15_000;

export function useLobbies() {
  const { client } = useApi();
  return useQuery({ queryKey: roomKeys.lobbies, queryFn: () => listRooms(client) });
}

export function useCurrentRoom() {
  const { client } = useApi();
  return useQuery({ queryKey: roomKeys.current, queryFn: () => getCurrentRoom(client) });
}

export function useRoom(roomId: string | null) {
  const { client } = useApi();
  return useQuery({
    queryKey: roomKeys.room(roomId ?? ''),
    queryFn: () => getRoom(client, roomId!),
    enabled: roomId !== null,
    refetchInterval: ROOM_REFRESH_MS,
  });
}

/** The user's room link on this device (see room-links). */
export function useRoomLink() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: roomKeys.link(userId),
    queryFn: () => readRoomLink(userId!),
    enabled: userId !== null,
  });
}

/** Every room change answers the room: it replaces the cached one, and the lists are read again. */
function useRoomChange<T>(change: (variables: T) => Promise<Room>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSuccess: (room: Room) => {
      queryClient.setQueryData(roomKeys.room(room.id), room);
      void queryClient.invalidateQueries({ queryKey: roomKeys.current }).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: roomKeys.lobbies }).catch(() => undefined);
    },
  });
}

export function useCreateRoom() {
  const { client } = useApi();
  return useRoomChange((room: NewRoom) => createRoom(client, room));
}

export function useJoinRoom() {
  const { client } = useApi();
  return useRoomChange(({ roomId, code }: { roomId?: string; code?: string }) =>
    code !== undefined ? joinRoomByCode(client, code) : joinRoom(client, roomId!),
  );
}

export function useRoomReady(roomId: string) {
  const { client } = useApi();
  return useRoomChange((ready: boolean) => setRoomReady(client, roomId, ready));
}

export function useStartRoom(roomId: string) {
  const { client } = useApi();
  return useRoomChange(() => startRoom(client, roomId));
}

export function useLeaveRoom(roomId: string) {
  const { client } = useApi();
  return useRoomChange(() => leaveRoom(client, roomId));
}

export function useCompleteRoom(roomId: string) {
  const { client } = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => completeRoom(client, roomId, sessionId),
    onSuccess: ({ room }) => queryClient.setQueryData(roomKeys.room(roomId), room),
  });
}
