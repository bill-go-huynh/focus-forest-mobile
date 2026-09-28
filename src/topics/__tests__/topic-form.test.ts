import { makeTopic } from '../../test-utils/topics';
import type { QueuedTopicCreate } from '../topic-create-queue';
import {
  NEW_TOPIC_DEFAULTS,
  newTopicFields,
  pendingTopicStatus,
  topicChanges,
  topicDescriptionError,
  topicNameError,
} from '../topic-form';

describe('new topic defaults (Phase 2: create asks only for a name)', () => {
  it('are fixed values: the default icon, the first palette color, no description', () => {
    expect(NEW_TOPIC_DEFAULTS).toEqual({
      icon: 'topic.default',
      color: 'topic.1',
      description: null,
    });
  });

  it('are the same whatever the name', () => {
    expect(newTopicFields('Reading')).toEqual({ name: 'Reading', ...NEW_TOPIC_DEFAULTS });
    expect(newTopicFields('Piano')).toEqual({ name: 'Piano', ...NEW_TOPIC_DEFAULTS });
  });
});

describe('topicNameError', () => {
  it('accepts a name, counted after trimming and NFC', () => {
    expect(topicNameError('Reading')).toBeNull();
    expect(topicNameError(`  ${'a'.repeat(100)}  `)).toBeNull();
    // 100 characters when composed, 200 code points when decomposed.
    expect(topicNameError('é'.repeat(100))).toBeNull();
  });

  it('asks for a name when it is blank', () => {
    expect(topicNameError('')).toBe('Add a name for this topic.');
    expect(topicNameError('  \n ')).toBe('Add a name for this topic.');
  });

  it('keeps names to 100 characters (code points, so emoji count once)', () => {
    expect(topicNameError('a'.repeat(101))).toBe('Keep the name to 100 characters or fewer.');
    expect(topicNameError('🌱'.repeat(100))).toBeNull();
    expect(topicNameError('🌱'.repeat(101))).toBe('Keep the name to 100 characters or fewer.');
  });
});

describe('topicDescriptionError', () => {
  it('allows no description, and up to 500 characters', () => {
    expect(topicDescriptionError('')).toBeNull();
    expect(topicDescriptionError('x'.repeat(500))).toBeNull();
    expect(topicDescriptionError('x'.repeat(501))).toBe(
      'Keep the description to 500 characters or fewer.',
    );
  });
});

describe('topicChanges (only what changed; never the icon)', () => {
  const topic = makeTopic({ name: 'Reading', description: 'Novels', color: 'topic.1' });

  it('sends nothing when nothing changed, whatever the spacing', () => {
    expect(
      topicChanges(topic, { name: ' Reading ', description: 'Novels ', color: 'topic.1' }),
    ).toEqual({});
  });

  it('sends a new name, trimmed and composed', () => {
    expect(
      topicChanges(topic, { name: '  Café ', description: 'Novels', color: 'topic.1' }),
    ).toEqual({ name: 'Café' });
  });

  it('clears a blank description as null', () => {
    expect(topicChanges(topic, { name: 'Reading', description: '  ', color: 'topic.1' })).toEqual({
      description: null,
    });
  });

  it('sends a new color', () => {
    expect(
      topicChanges(topic, { name: 'Reading', description: 'Novels', color: 'topic.4' }),
    ).toEqual({ color: 'topic.4' });
  });

  it('never sends the icon', () => {
    const changes = topicChanges(topic, { name: 'Books', description: '', color: 'topic.2' });
    expect(changes).not.toHaveProperty('icon');
  });
});

describe('pendingTopicStatus (a queued create as the Topics screen shows it)', () => {
  const item = (overrides: Partial<QueuedTopicCreate>): QueuedTopicCreate => ({
    id: 'aaaaaaaa-0000-4000-8000-00000000000a',
    payload: { name: 'Reading', icon: 'topic.default', color: 'topic.1', description: null },
    state: 'pending',
    attempted: false,
    queuedAt: 0,
    ...overrides,
  });

  it('shows a waiting topic neutrally, editable only while no attempt could have created it', () => {
    expect(pendingTopicStatus(item({ attempted: false }))).toEqual({
      label: 'Waiting to sync',
      tone: 'neutral',
      editable: true,
    });
    expect(pendingTopicStatus(item({ attempted: true }))).toEqual({
      label: 'Waiting to sync',
      tone: 'neutral',
      editable: false,
    });
  });

  it('asks for another name when the name was taken, and lets it be changed', () => {
    expect(pendingTopicStatus(item({ state: 'needs_name_change', attempted: false }))).toEqual({
      label: 'Choose another name to sync this topic.',
      tone: 'attention',
      editable: true,
    });
  });

  it('shows a topic that needs a look without internal codes, and never edits it', () => {
    const status = pendingTopicStatus(item({ state: 'needs_attention', attempted: true }));
    expect(status).toEqual({
      label: 'This topic needs a look before it can sync.',
      tone: 'attention',
      editable: false,
    });
    expect(status.label).not.toMatch(/topic_|conflict|fail|error/i);
  });
});
