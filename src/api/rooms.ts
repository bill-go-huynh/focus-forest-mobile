import { z } from 'zod';

import type { ApiClient } from './client';
import { HttpError } from './errors';
import { earnedBadgeSchema } from './progression';

/**
 * Focus Together (A5.4, focus-forest-api `src/rooms/`): rooms as one viewer sees them. Every change
 * is REST and answers the room; the live channel only pushes the same state (docs/07 §6). Phases
 * and the start time are the server's: the app counts down to `startsAt` and never decides one.
 */

const instant = z.iso.datetime();
const count = z.number().int().nonnegative();

export const roomPersonSchema = z.object({
  id: z.string(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

/** Where a person is. There is no "left": someone who leaves simply disappears. */
export const placeStateSchema = z.enum(['waiting', 'ready', 'focusing', 'completed']);
export type PlaceState = z.infer<typeof placeStateSchema>;

export const roomSchema = z.object({
  id: z.string(),
  /** Only for people in the room: how a private room is shared. */
  code: z.string().nullable(),
  name: z.string(),
  /** A label for the room, never anyone's Topic. */
  topic: z.string().nullable(),
  durationMinutes: count,
  maxParticipants: count,
  visibility: z.enum(['public', 'private']),
  /** A string: later phases may add phases; an unknown one reads as ended. */
  phase: z.string(),
  startsAt: instant.nullable(),
  endsAt: instant.nullable(),
  participants: z.array(
    z.object({ user: roomPersonSchema, host: z.boolean(), state: placeStateSchema }),
  ),
  you: z.object({ host: z.boolean(), state: placeStateSchema }).nullable(),
});
export type Room = z.infer<typeof roomSchema>;

const roomListSchema = z.object({ items: z.array(roomSchema) });
const currentRoomSchema = z.object({ room: roomSchema.nullable() });
const completionSchema = z.object({
  room: roomSchema,
  progression: z.object({ newlyEarnedBadges: z.array(earnedBadgeSchema) }),
});
export type RoomCompletion = z.infer<typeof completionSchema>;

export interface NewRoom {
  name: string;
  topic: string | null;
  durationMinutes: number;
  maxParticipants: number;
  visibility: 'public' | 'private';
}

export function listRooms(client: ApiClient) {
  return client.request('/rooms', { schema: roomListSchema });
}

export function getCurrentRoom(client: ApiClient) {
  return client.request('/rooms/current', { schema: currentRoomSchema });
}

export function getRoom(client: ApiClient, roomId: string) {
  return client.request(`/rooms/${roomId}`, { schema: roomSchema });
}

export function createRoom(client: ApiClient, room: NewRoom) {
  return client.request('/rooms', { method: 'POST', body: room, schema: roomSchema });
}

export function joinRoomByCode(client: ApiClient, code: string) {
  return client.request('/rooms/join', { method: 'POST', body: { code }, schema: roomSchema });
}

export function joinRoom(client: ApiClient, roomId: string) {
  return client.request(`/rooms/${roomId}/join`, { method: 'POST', schema: roomSchema });
}

export function setRoomReady(client: ApiClient, roomId: string, ready: boolean) {
  return client.request(`/rooms/${roomId}/ready`, {
    method: ready ? 'PUT' : 'DELETE',
    schema: roomSchema,
  });
}

export function startRoom(client: ApiClient, roomId: string) {
  return client.request(`/rooms/${roomId}/start`, { method: 'POST', schema: roomSchema });
}

export function leaveRoom(client: ApiClient, roomId: string) {
  return client.request(`/rooms/${roomId}/leave`, { method: 'POST', schema: roomSchema });
}

export function completeRoom(client: ApiClient, roomId: string, sessionId: string) {
  return client.request(`/rooms/${roomId}/complete`, {
    method: 'POST',
    body: { sessionId },
    schema: completionSchema,
  });
}

/** The stable code of a refused room request (`room_full`, `session_not_found`, …). */
export function roomErrorCode(error: unknown): string | null {
  return error instanceof HttpError ? error.code : null;
}
