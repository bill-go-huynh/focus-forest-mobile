import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import type { KeyValueStorage } from '../common/stored-json';

/**
 * The link between the user's room and their own focus session (M5.2), kept on the device so a
 * restart does not lose it: which room, the topic they chose for it (a room's topic is only a
 * label, each person focuses on their own), and the session the app started for it. The room is
 * completed with that session once it is saved; then the link is removed.
 */

export const roomLinkKey = (userId: string) => `focus-forest/room-link/v1/${userId}`;

const roomLinkSchema = z.object({
  version: z.literal(1),
  roomId: z.string(),
  topicId: z.string(),
  sessionId: z.string().nullable(),
});
export type RoomLink = z.infer<typeof roomLinkSchema>;

export async function readRoomLink(
  userId: string,
  storage: KeyValueStorage = AsyncStorage,
): Promise<RoomLink | null> {
  try {
    const raw = await storage.getItem(roomLinkKey(userId));
    if (raw === null) return null;
    const parsed = roomLinkSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveRoomLink(
  userId: string,
  link: Omit<RoomLink, 'version'>,
  storage: KeyValueStorage = AsyncStorage,
): Promise<void> {
  await storage.setItem(roomLinkKey(userId), JSON.stringify({ version: 1, ...link }));
}

export async function clearRoomLink(
  userId: string,
  storage: KeyValueStorage = AsyncStorage,
): Promise<void> {
  await storage.removeItem(roomLinkKey(userId));
}
