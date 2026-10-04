import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

import { submitSession, updateProfile, type ApiClient } from '../api';
import { getDeviceTimeZone } from '../auth/device-time-zone';
import type { CelebrationStore } from '../celebrations/celebration-store';
import type { KeyValueStorage, StorageIssue } from '../common/stored-json';
import { serverConfirmations } from '../core-loop/confirmations';
import { invalidateCoreLoop } from '../core-loop/query-keys';
import { invalidateInsights } from '../insights/queries';
import { invalidateHistory } from '../history/query-keys';
import { profileQueryKey } from '../profile/queries';
import { invalidateTopicLists } from '../topics/query-keys';
import type { TopicCreateQueue } from '../topics/topic-create-queue';
import type { CompletionReceipts } from './completion-receipts';
import { SessionOutbox } from './session-outbox';

/**
 * The outbox wired to the API, the topic queue, and the query cache: a session is sent with PUT
 * /me/sessions/:id (the answer validated by `sessionSchema`), and only once its topic is on the
 * server; a flush first asks the topic queue to send what it holds. A synced session changes the
 * topics' last use (A2.8), the history (A2.7), and Home and the tree (A3.3), so they are
 * refetched; a failed refetch leaves what was saved. Before the session leaves the outbox, its
 * growth is kept as a celebration and the answer as its completion receipt.
 */
export function createSessionOutbox({
  storage,
  client,
  queryClient,
  topicQueue,
  receipts,
  celebrations,
  report,
  currentUserId,
  now = Date.now,
}: {
  storage: KeyValueStorage;
  client: ApiClient;
  queryClient: QueryClient;
  topicQueue: TopicCreateQueue;
  receipts: CompletionReceipts;
  /** Where the server's growth waits to be shown (M3.2). */
  celebrations: CelebrationStore;
  report: (issue: StorageIssue) => void;
  /** The signed-in user, so a time zone repair never reaches another user's profile. */
  currentUserId: () => string | null;
  now?: () => number;
}): SessionOutbox {
  return new SessionOutbox({
    storage,
    now,
    report,
    send: (id, payload) => submitSession(client, id, payload),
    isTopicSynced: (topicId) => topicQueue.isTopicSynced(topicId),
    syncTopics: () => topicQueue.flush(),
    onSynced: () => {
      void invalidateTopicLists(queryClient).catch(() => undefined);
      void invalidateHistory(queryClient).catch(() => undefined);
      void invalidateCoreLoop(queryClient).catch(() => undefined);
      void invalidateInsights(queryClient).catch(() => undefined);
    },
    // The growth is kept as a celebration first, then the receipt: until both are stored the
    // session stays queued, and a replay (200) answers the same stored growth. The count moves
    // first, so no Home asked before this confirmation passes for one asked after it.
    keepReceipt: async (userId, session) => {
      serverConfirmations.advance();
      return (await celebrations.record(userId, session)) && receipts.keep(userId, session);
    },
    repairTimeZone: createTimeZoneRepair({ client, queryClient, currentUserId }),
  });
}

/**
 * The outbox's answer to `timezone_required` (A2.5): PATCH /me/profile with the device's IANA
 * time zone, the same one sign-up sends. Resolves true only once the server saved that zone for
 * this user. No valid device zone, another signed-in user, or a failed PATCH resolves false, and
 * the sessions stay blocked for a later flush. The session payload is never touched here.
 */
export function createTimeZoneRepair({
  client,
  queryClient,
  currentUserId,
  deviceTimeZone = getDeviceTimeZone,
}: {
  client: ApiClient;
  queryClient: QueryClient;
  currentUserId: () => string | null;
  deviceTimeZone?: () => string | null;
}): (userId: string) => Promise<boolean> {
  return async (userId) => {
    if (currentUserId() !== userId) return false;
    const timezone = deviceTimeZone();
    if (!timezone) return false;
    try {
      const profile = await updateProfile(client, { timezone });
      if (currentUserId() !== userId) return false;
      queryClient.setQueryData(profileQueryKey, profile);
      return profile.timezone === timezone;
    } catch {
      return false;
    }
  };
}

/** The app's session outbox, on AsyncStorage. Issues are reported by code only. */
export function createAppSessionOutbox({
  client,
  queryClient,
  topicQueue,
  receipts,
  celebrations,
  currentUserId,
}: {
  client: ApiClient;
  queryClient: QueryClient;
  topicQueue: TopicCreateQueue;
  receipts: CompletionReceipts;
  celebrations: CelebrationStore;
  currentUserId: () => string | null;
}): SessionOutbox {
  return createSessionOutbox({
    storage: AsyncStorage,
    client,
    queryClient,
    topicQueue,
    receipts,
    celebrations,
    currentUserId,
    report: (issue) => console.warn(`[sessions] session outbox: ${issue.code}`),
  });
}
