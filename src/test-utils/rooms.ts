import { KAI_ID, LINH_ID } from './social';

/**
 * A5.4 answers shaped like focus-forest-api `src/rooms/rooms.dto.ts`: a room as one viewer sees
 * it (state only), and the live channel's messages.
 */

export const ROOM_ID = '0190b000-0000-7000-8000-00000000c001';
export const ME_ID = 'user-1';

type PlaceState = 'waiting' | 'ready' | 'focusing' | 'completed';

export function person(id: string, name: string, username: string) {
  return { id, username, displayName: name, avatarUrl: null };
}

export interface RoomFixture {
  phase?: 'lobby' | 'countdown' | 'focusing' | 'ended' | 'closed';
  startsAt?: string | null;
  you?: { host: boolean; state: PlaceState } | null;
  others?: { id: string; name: string; username: string; host?: boolean; state: PlaceState }[];
  visibility?: 'public' | 'private';
  name?: string;
  durationMinutes?: number;
}

export function makeRoom({
  phase = 'lobby',
  startsAt = null,
  you = { host: true, state: 'waiting' },
  others = [{ id: LINH_ID, name: 'Linh', username: 'linh', state: 'ready' }],
  visibility = 'public',
  name = 'Morning study',
  durationMinutes = 25,
}: RoomFixture = {}) {
  const participants = [
    ...(you ? [{ user: person(ME_ID, 'Mai Anh', 'mai'), host: you.host, state: you.state }] : []),
    ...others.map((other) => ({
      user: person(other.id, other.name, other.username),
      host: other.host ?? false,
      state: other.state,
    })),
  ];
  return {
    id: ROOM_ID,
    code: you ? 'ABC234' : null,
    name,
    topic: 'Exams',
    durationMinutes,
    maxParticipants: 4,
    visibility,
    phase,
    startsAt,
    endsAt: startsAt
      ? new Date(Date.parse(startsAt) + durationMinutes * 60_000).toISOString()
      : null,
    participants,
    you,
  };
}

export const KAI = { id: KAI_ID, name: 'Kai', username: 'kai' };
