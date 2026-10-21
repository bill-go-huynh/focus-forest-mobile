import { useState } from 'react';
import { Text, View } from 'react-native';

import { topicErrorCode, TOPIC_COLORS, type Topic } from '../api/topics';
import { Button } from '../components/Button';
import { Chip } from '../components/Chip';
import { InlineStatus } from '../components/InlineStatus';
import { Input } from '../components/Input';
import { Sheet } from '../components/Sheet';
import { topicColorKey, TopicMark } from '../components/TopicMark';
import { TOPIC_ICONS } from '../components/topic-icons';
import { useTheme } from '../theme';
import { useUpdateTopic } from './queries';
import type { QueuedTopicCreate } from './topic-create-queue';
import { usePickerTopics, useTopicCreateQueue } from './topic-create-sync';
import {
  NEW_TOPIC_DEFAULTS,
  newTopicFields,
  openSuggestions,
  TOPIC_NAME_SUGGESTIONS,
  pendingTopicStatus,
  topicChanges,
  topicDescriptionError,
  topicNameError,
} from './topic-form';

const NAME_TAKEN = 'Another active topic already uses this name.';
const NOT_SAVED_ON_DEVICE = "We couldn't save this topic on your device.";

/** The last non-null value, so a sheet keeps its content while it slides away. */
function useLast<T>(value: T | null): T | null {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}

/**
 * Create a topic: a name only (docs/02). The icon and color get the fixed defaults, except
 * that a suggested name brings its icon (kept while the name is edited, dropped once it is
 * cleared). It is queued on the device first (M2.5), so it closes once stored, online or not,
 * and the topic shows at once as waiting to sync.
 */
export function CreateTopicSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  /** Hears the new topic's id once it is stored on the device, before the sheet closes. */
  onCreated?: (topicId: string) => void;
}) {
  const theme = useTheme();
  const queue = useTopicCreateQueue();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(NEW_TOPIC_DEFAULTS.icon);
  const [nameError, setNameError] = useState<string | null>(null);
  const [notSaved, setNotSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const changeName = (text: string) => {
    setName(text);
    if (text.trim() === '') setIcon(NEW_TOPIC_DEFAULTS.icon);
    if (nameError) setNameError(null);
  };

  const close = () => {
    setName('');
    setIcon(NEW_TOPIC_DEFAULTS.icon);
    setNameError(null);
    setNotSaved(false);
    onClose();
  };

  const create = async () => {
    if (saving) return;
    const error = topicNameError(name);
    setNameError(error);
    if (error) return;
    setSaving(true);
    const queued = await queue.enqueue(newTopicFields(name, icon));
    setSaving(false);
    if (queued.ok) {
      onCreated?.(queued.item.id);
      close();
    } else setNotSaved(true);
  };

  return (
    <Sheet visible={visible} onRequestClose={close} title="New topic">
      <View style={{ gap: theme.space[4] }}>
        <Input
          label="Name"
          value={name}
          onChangeText={changeName}
          error={nameError ?? undefined}
          helper="You can change its color later."
          returnKeyType="done"
          onSubmitEditing={() => void create()}
        />
        {/* Only while open: the topics are read when the form is in use. */}
        {visible ? (
          <NameSuggestions
            name={name}
            onPick={(suggestion) => {
              changeName(suggestion.name);
              setIcon(suggestion.icon);
            }}
          />
        ) : null}
        {notSaved ? (
          <InlineStatus tone="attention" message={NOT_SAVED_ON_DEVICE} detail="Try again." live />
        ) : null}
        <Button
          variant="primary"
          label={saving ? 'Creating…' : 'Create'}
          onPress={() => void create()}
          disabled={saving}
        />
      </View>
    </Sheet>
  );
}

/** Suggested names (docs/02), leaving out those the user already has; nothing when all are. */
function NameSuggestions({
  name,
  onPick,
}: {
  name: string;
  onPick: (suggestion: (typeof TOPIC_NAME_SUGGESTIONS)[number]) => void;
}) {
  const theme = useTheme();
  const { items } = usePickerTopics();
  const suggestions = openSuggestions(
    items.map((entry) => (entry.kind === 'confirmed' ? entry.topic.name : entry.name)),
  );
  if (suggestions.length === 0) return null;
  return (
    <View style={{ gap: theme.space[2] }}>
      <Text style={[theme.type.caption, { color: theme.colors.text.muted }]}>
        Or start from a suggestion
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        {suggestions.map((suggestion) => (
          <Chip
            key={suggestion.name}
            label={suggestion.name}
            accessibilityLabel={`Suggested name: ${suggestion.name}`}
            icon={() => (
              <TopicMark color={NEW_TOPIC_DEFAULTS.color} icon={suggestion.icon} size="sm" />
            )}
            selected={name.trim() === suggestion.name}
            onPress={() => onPick(suggestion)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * A queued create. While no attempt can have created it (never sent, or refused because the
 * name was taken), its name may change: the same id is sent again (M2.5 `revise`). After an
 * uncertain attempt its fields are frozen until the server confirms it, so it is only shown.
 */
export function PendingTopicSheet({
  item,
  onClose,
}: {
  item: QueuedTopicCreate | null;
  onClose: () => void;
}) {
  const shown = useLast(item);
  return (
    <Sheet visible={item !== null} onRequestClose={onClose} title={shown?.payload.name ?? 'Topic'}>
      {shown ? <PendingTopicContent key={shown.id} item={shown} onClose={onClose} /> : null}
    </Sheet>
  );
}

function PendingTopicContent({ item, onClose }: { item: QueuedTopicCreate; onClose: () => void }) {
  const theme = useTheme();
  const queue = useTopicCreateQueue();
  const status = pendingTopicStatus(item);
  const [name, setName] = useState(item.payload.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [notSaved, setNotSaved] = useState(false);

  if (!status.editable) {
    const waiting = item.state === 'pending';
    return (
      <InlineStatus
        tone={status.tone}
        message={status.label}
        detail={
          waiting
            ? 'This topic is saved on this device and will sync when you are back online.'
            : 'It stays saved on this device.'
        }
      />
    );
  }

  const save = async () => {
    const error = topicNameError(name);
    setNameError(error);
    if (error) return;
    const revised = await queue.revise(item.id, { ...item.payload, name });
    if (revised.ok) onClose();
    else setNotSaved(true);
  };

  return (
    <View style={{ gap: theme.space[4] }}>
      {item.state === 'needs_name_change' ? (
        <InlineStatus tone="attention" message={NAME_TAKEN} detail={status.label} />
      ) : null}
      <Input
        label="Name"
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (nameError) setNameError(null);
        }}
        error={nameError ?? undefined}
        returnKeyType="done"
        onSubmitEditing={() => void save()}
      />
      {notSaved ? (
        <InlineStatus tone="attention" message={NOT_SAVED_ON_DEVICE} detail="Try again." live />
      ) : null}
      <Button variant="primary" label="Save" onPress={() => void save()} />
    </View>
  );
}

/**
 * Edit a topic the server has: name, description, color, and icon. Online only: the change
 * shows once the server has answered. The icon comes from the curated set (docs/01 §5; ART.9):
 * creating a topic needs only a name, and its icon can be changed here anytime (docs/02).
 */
export function EditTopicSheet({
  topic,
  onClose,
  onArchive,
}: {
  topic: Topic | null;
  onClose: () => void;
  onArchive: (topic: Topic) => void;
}) {
  const shown = useLast(topic);
  return (
    <Sheet visible={topic !== null} onRequestClose={onClose} title="Edit topic">
      {shown ? (
        <EditTopicContent key={shown.id} topic={shown} onClose={onClose} onArchive={onArchive} />
      ) : null}
    </Sheet>
  );
}

function EditTopicContent({
  topic,
  onClose,
  onArchive,
}: {
  topic: Topic;
  onClose: () => void;
  onArchive: (topic: Topic) => void;
}) {
  const theme = useTheme();
  const update = useUpdateTopic();
  const [name, setName] = useState(topic.name);
  const [description, setDescription] = useState(topic.description ?? '');
  const [color, setColor] = useState(topic.color);
  const [icon, setIcon] = useState(topic.icon);
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [notSaved, setNotSaved] = useState(false);

  const save = async () => {
    if (update.isPending) return;
    const errors = [topicNameError(name), topicDescriptionError(description)] as const;
    setNameError(errors[0]);
    setDescriptionError(errors[1]);
    if (errors[0] || errors[1]) return;
    const changes = topicChanges(topic, { name, description, color, icon });
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setNotSaved(false);
    try {
      await update.mutateAsync({ id: topic.id, changes });
      onClose();
    } catch (error) {
      if (topicErrorCode(error) === 'topic_name_taken') setNameError(NAME_TAKEN);
      else setNotSaved(true);
    }
  };

  return (
    <View style={{ gap: theme.space[4] }}>
      <Input
        label="Name"
        value={name}
        onChangeText={(text) => {
          setName(text);
          if (nameError) setNameError(null);
        }}
        error={nameError ?? undefined}
      />
      <Input
        label="Description"
        value={description}
        onChangeText={(text) => {
          setDescription(text);
          if (descriptionError) setDescriptionError(null);
        }}
        error={descriptionError ?? undefined}
        helper="Optional."
        multiline
      />
      <View style={{ gap: theme.space[2] }}>
        <Text
          accessibilityRole="header"
          style={[theme.type.label, { color: theme.colors.text.primary }]}
        >
          Color
        </Text>
        {/* Each color is named and shows its selection by outline, never by color alone. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {TOPIC_COLORS.map((option, index) => (
            <Chip
              key={option}
              label={`Color ${index + 1}`}
              topicColor={topicColorKey(option) ?? undefined}
              selected={option === color}
              onPress={() => setColor(option)}
            />
          ))}
        </View>
      </View>
      <View style={{ gap: theme.space[2] }}>
        <Text
          accessibilityRole="header"
          style={[theme.type.label, { color: theme.colors.text.primary }]}
        >
          Icon
        </Text>
        {/* Each icon is named; the selected one shows by outline, in the topic's color. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
          {TOPIC_ICONS.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              icon={() => <TopicMark color={color} icon={option.id} size="sm" />}
              selected={option.id === icon}
              onPress={() => setIcon(option.id)}
            />
          ))}
        </View>
      </View>
      {notSaved ? (
        <InlineStatus
          tone="attention"
          message="We couldn't save your changes right now."
          detail="Nothing was changed. Try again when you're online."
          live
        />
      ) : null}
      <Button
        variant="primary"
        label={update.isPending ? 'Saving…' : 'Save'}
        onPress={() => void save()}
        disabled={update.isPending}
      />
      <Button variant="secondary" label="Archive topic" onPress={() => onArchive(topic)} />
    </View>
  );
}
