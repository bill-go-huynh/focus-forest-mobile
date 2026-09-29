import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

import { submitSession, type ApiClient } from '../api';
import type { KeyValueStorage, StorageIssue } from '../common/stored-json';
import { invalidateTopicLists } from '../topics/query-keys';
import type { TopicCreateQueue } from '../topics/topic-create-queue';
import type { CompletionReceipts } from './completion-receipts';
import { SessionOutbox } from './session-outbox';

/**
 * The outbox wired to the API, the topic queue, and the query cache: a session is sent with PUT
 * /me/sessions/:id (the answer validated by `sessionSchema`), and only once its topic is on the
 * server; a flush first asks the topic queue to send what it holds. A synced session changes the
 * topics' last use (A2.8), so the topic lists are refetched: the server's answer is saved as
 * usual, and a failed refetch leaves the last saved lists. The answer is kept as the session's
 * completion receipt before the session leaves the outbox.
 */
export function createSessionOutbox({
  storage,
  client,
  queryClient,
  topicQueue,
  receipts,
  report,
  now = Date.now,
}: {
  storage: KeyValueStorage;
  client: ApiClient;
  queryClient: QueryClient;
  topicQueue: TopicCreateQueue;
  receipts: CompletionReceipts;
  report: (issue: StorageIssue) => void;
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
    },
    keepReceipt: (userId, session) => receipts.keep(userId, session),
  });
}

/** The app's session outbox, on AsyncStorage. Issues are reported by code only. */
export function createAppSessionOutbox({
  client,
  queryClient,
  topicQueue,
  receipts,
}: {
  client: ApiClient;
  queryClient: QueryClient;
  topicQueue: TopicCreateQueue;
  receipts: CompletionReceipts;
}): SessionOutbox {
  return createSessionOutbox({
    storage: AsyncStorage,
    client,
    queryClient,
    topicQueue,
    receipts,
    report: (issue) => console.warn(`[sessions] session outbox: ${issue.code}`),
  });
}
