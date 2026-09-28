import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

import type { ApiClient } from '../api';
import type { StorageIssue } from '../common/stored-json';
import { createClientId } from '../ids/client-id';
import type { TopicCreateQueue } from './topic-create-queue';
import { createTopicCreateQueue } from './topic-create-sync';
import { TopicSnapshotStore } from './topic-snapshot-store';

/** The app's topic snapshot store, on AsyncStorage. Issues are reported by code only. */
export function createAppTopicStore(): TopicSnapshotStore {
  return new TopicSnapshotStore({ storage: AsyncStorage, report: reportTopicStorageIssue });
}

function reportTopicStorageIssue(issue: StorageIssue): void {
  console.warn(`[topics] saved topic lists: ${issue.code}`);
}

/** The app's offline topic-create queue, on AsyncStorage and expo-crypto ids. */
export function createAppTopicCreateQueue({
  client,
  queryClient,
  snapshots,
}: {
  client: ApiClient;
  queryClient: QueryClient;
  snapshots: TopicSnapshotStore;
}): TopicCreateQueue {
  return createTopicCreateQueue({
    storage: AsyncStorage,
    client,
    queryClient,
    snapshots,
    createId: createClientId,
    report: (issue) => console.warn(`[topics] queued topic creates: ${issue.code}`),
  });
}
