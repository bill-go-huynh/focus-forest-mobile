import { TOPIC_COLORS, type NewTopicFields, type Topic, type TopicChanges } from '../api/topics';
import type { InlineStatusTone } from '../components/InlineStatus';
import type { QueuedTopicCreate } from './topic-create-queue';

/** A2.2 technical limits, in Unicode characters after trimming and NFC. */
export const TOPIC_NAME_MAX = 100;
export const TOPIC_DESCRIPTION_MAX = 500;

/**
 * What a new topic gets besides its name (docs/02: creating a topic needs only a name; icon
 * and color get defaults). Fixed values: never random, cycled, or derived from the name.
 * `topic.default` stands for the default icon until the curated icon set exists.
 */
export const NEW_TOPIC_DEFAULTS = {
  icon: 'topic.default',
  // `topic.1`, the first palette color.
  color: TOPIC_COLORS[0],
  description: null,
} as const satisfies Omit<NewTopicFields, 'name'>;

export function newTopicFields(name: string): NewTopicFields {
  return { name, ...NEW_TOPIC_DEFAULTS };
}

/** Trimmed and NFC, the way the API stores and compares text. */
const canonical = (text: string) => text.normalize('NFC').trim();
const characters = (text: string) => Array.from(canonical(text)).length;

/**
 * The client checks only what helps while typing. The server decides the rest, such as a
 * name another active topic already has (ignoring case).
 */
export function topicNameError(name: string): string | null {
  if (characters(name) === 0) return 'Add a name for this topic.';
  if (characters(name) > TOPIC_NAME_MAX) return 'Keep the name to 100 characters or fewer.';
  return null;
}

export function topicDescriptionError(description: string): string | null {
  return characters(description) > TOPIC_DESCRIPTION_MAX
    ? 'Keep the description to 500 characters or fewer.'
    : null;
}

export interface TopicEditValues {
  name: string;
  description: string;
  color: string;
}

/** Only the fields that changed; a blank description clears it (null). Never the icon. */
export function topicChanges(topic: Topic, values: TopicEditValues): TopicChanges {
  const changes: TopicChanges = {};
  const name = canonical(values.name);
  if (name !== topic.name) changes.name = name;
  const description = canonical(values.description) || null;
  if (description !== topic.description) changes.description = description;
  if (values.color !== topic.color) changes.color = values.color;
  return changes;
}

export interface PendingTopicStatus {
  /** Shown under the name, and read with it. */
  label: string;
  tone: InlineStatusTone;
  /** Whether its fields may change: only while no attempt can have created it (M2.5). */
  editable: boolean;
}

/** A queued create as the Topics screen shows it. Internal codes never reach the words. */
export function pendingTopicStatus(item: QueuedTopicCreate): PendingTopicStatus {
  if (item.state === 'needs_name_change') {
    return { label: 'Choose another name to sync this topic.', tone: 'attention', editable: true };
  }
  if (item.state === 'needs_attention') {
    return {
      label: 'This topic needs a look before it can sync.',
      tone: 'attention',
      editable: false,
    };
  }
  return { label: 'Waiting to sync', tone: 'neutral', editable: !item.attempted };
}
