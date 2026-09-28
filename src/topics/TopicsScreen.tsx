import { useState } from 'react';
import { View } from 'react-native';

import { topicErrorCode, type Topic, type TopicStatus } from '../api/topics';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { Confirmation } from '../components/Confirmation';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { InlineStatus } from '../components/InlineStatus';
import { ListRow } from '../components/ListRow';
import { Screen } from '../components/Screen';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import { TopicMark } from '../components/TopicMark';
import { useTheme } from '../theme';
import { useArchiveTopic, useRestoreTopic } from './queries';
import type { QueuedTopicCreate } from './topic-create-queue';
import { useManagedTopics } from './topic-create-sync';
import { pendingTopicStatus } from './topic-form';
import { CreateTopicSheet, EditTopicSheet, PendingTopicSheet } from './TopicSheets';

type Notice = { message: string; detail: string };

/**
 * Topics (Profile → Topics, docs/05): the user's active topics in the server's order, then
 * the ones waiting to sync; the archived ones one tap away. Create asks only for a name; a
 * topic the server has can be edited (online), archived, and restored. Nothing is deleted.
 */
export function TopicsScreen() {
  const theme = useTheme();
  const [view, setView] = useState<TopicStatus>('active');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Topic | null>(null);
  const [pending, setPending] = useState<QueuedTopicCreate | null>(null);
  const [archiving, setArchiving] = useState<Topic | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const archive = useArchiveTopic();

  const confirmArchive = async () => {
    const topic = archiving;
    setArchiving(null);
    if (!topic) return;
    try {
      await archive.mutateAsync(topic.id);
      setNotice(null);
    } catch {
      setNotice({
        message: "We couldn't archive this topic right now.",
        detail: "It is still active. Try again when you're online.",
      });
    }
  };

  const show = (next: TopicStatus) => {
    setView(next);
    setNotice(null);
  };

  return (
    <Screen title="Topics" safeTop={false}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        <Chip label="Active" selected={view === 'active'} onPress={() => show('active')} />
        <Chip label="Archived" selected={view === 'archived'} onPress={() => show('archived')} />
      </View>
      {view === 'active' ? (
        <Button variant="primary" label="Create topic" onPress={() => setCreating(true)} />
      ) : null}
      {notice ? (
        <InlineStatus tone="attention" message={notice.message} detail={notice.detail} live />
      ) : null}
      <TopicList
        key={view}
        status={view}
        onEdit={setEditing}
        onOpenPending={setPending}
        onNotice={setNotice}
      />
      <CreateTopicSheet visible={creating} onClose={() => setCreating(false)} />
      <EditTopicSheet
        topic={editing}
        onClose={() => setEditing(null)}
        onArchive={(topic) => {
          setEditing(null);
          setArchiving(topic);
        }}
      />
      <PendingTopicSheet item={pending} onClose={() => setPending(null)} />
      <Confirmation
        visible={archiving !== null}
        title="Archive this topic?"
        message="Your past focus sessions will stay in history. You can restore it anytime."
        confirmLabel="Archive"
        onConfirm={() => void confirmArchive()}
        onCancel={() => setArchiving(null)}
      />
    </Screen>
  );
}

function TopicList({
  status,
  onEdit,
  onOpenPending,
  onNotice,
}: {
  status: TopicStatus;
  onEdit: (topic: Topic) => void;
  onOpenPending: (item: QueuedTopicCreate) => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const theme = useTheme();
  const { confirmed, pending, list } = useManagedTopics(status);
  const restore = useRestoreTopic();

  const restoreTopic = async (topic: Topic) => {
    try {
      await restore.mutateAsync(topic.id);
      onNotice(null);
    } catch (error) {
      onNotice(
        topicErrorCode(error) === 'topic_name_taken'
          ? {
              message: 'An active topic already uses this name.',
              detail: 'Rename or archive that topic, then restore this one.',
            }
          : {
              message: "We couldn't restore this topic right now.",
              detail: "Try again when you're online.",
            },
      );
    }
  };

  if (confirmed === undefined && pending.length === 0) {
    if (list.isError) {
      return (
        <ErrorState
          message="We couldn't load your topics right now."
          onRetry={() => void list.refetch()}
        />
      );
    }
    return (
      <SkeletonGroup label="Loading your topics">
        <Skeleton variant="text" lines={3} />
      </SkeletonGroup>
    );
  }

  if ((confirmed ?? []).length === 0 && pending.length === 0) {
    return status === 'active' ? (
      <EmptyState
        illustration="seed-in-soil"
        message="Topics are what you focus on, in your own words."
      />
    ) : (
      <EmptyState illustration="clearing" message="Archived topics will appear here." />
    );
  }

  return (
    <View style={{ gap: theme.space[3] }}>
      {/* Saved topics stay usable when the server cannot be reached. */}
      {list.isError && confirmed !== undefined ? (
        <InlineStatus tone="info" message="Showing topics saved on this device." />
      ) : null}
      <View testID="topics-list" style={{ gap: theme.space[1] }}>
        {confirmed?.map((topic) => {
          const leading = () => <TopicMark color={topic.color} icon={topic.icon} />;
          return status === 'active' ? (
            <ListRow
              key={topic.id}
              title={topic.name}
              subtitle={topic.description ?? undefined}
              leading={leading}
              onPress={() => onEdit(topic)}
              accessibilityHint="Opens this topic to edit or archive it."
            />
          ) : (
            <ListRow
              key={topic.id}
              title={topic.name}
              subtitle={topic.description ?? undefined}
              leading={leading}
              action={
                <Button
                  variant="secondary"
                  label="Restore"
                  accessibilityLabel={`Restore ${topic.name}`}
                  onPress={() => void restoreTopic(topic)}
                  disabled={restore.isPending}
                />
              }
            />
          );
        })}
        {pending.map((item) => (
          <ListRow
            key={item.id}
            title={item.payload.name}
            subtitle={pendingTopicStatus(item).label}
            leading={() => <TopicMark color={item.payload.color} icon={item.payload.icon} />}
            onPress={() => onOpenPending(item)}
          />
        ))}
      </View>
    </View>
  );
}
