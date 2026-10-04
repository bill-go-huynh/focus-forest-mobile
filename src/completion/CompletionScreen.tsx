import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { announce } from '../accessibility';
import { useSession, type FocusSession, type HistoryTopic } from '../api';
import { Button } from '../components/Button';
import { InlineStatus } from '../components/InlineStatus';
import { Input } from '../components/Input';
import { Screen } from '../components/Screen';
import { TopicMark } from '../components/TopicMark';
import { useHistoryItem } from '../history/queries';
import { receiptFor } from '../sessions/completion-receipts';
import { useCompletionReceiptsSnapshot } from '../sessions/CompletionReceiptsProvider';
import { useSessionNotes, useSessionNotesSnapshot } from '../sessions/SessionNotesProvider';
import { useSessionOutboxSnapshot } from '../sessions/SessionOutboxProvider';
import { canonicalNote, noteError } from '../sessions/session-note';
import { useTheme } from '../theme';
import { useActiveTimer } from '../timer/ActiveTimerProvider';
import { focusedMillisecondsOf } from '../timer/submission';
import { useTopicIdentity } from '../topics/topic-create-sync';
import { NEW_TOPIC_DEFAULTS } from '../topics/topic-form';
import { CompletionGrowth } from './CompletionGrowth';

const MINUTE = 60_000;
const UNKNOWN_TOPIC_NAME = 'Focus topic';

/**
 * What the screen knows about the session. `server`: the server's evaluation (A2.5), which is
 * the truth: status and focused time. `device`: only the queued submission; its focused time is
 * what the timer measured, and no outcome is claimed before the server answers.
 */
type Known =
  | {
      kind: 'server';
      topicId: string;
      focusedMilliseconds: number;
      session: FocusSession;
      /** The topic as History last listed it (A2.7), for a topic the device may not know. */
      topic: HistoryTopic | null;
    }
  | { kind: 'device'; topicId: string; focusedMilliseconds: number }
  | { kind: 'saving' }
  | { kind: 'missing' };

/**
 * The server's latest answer for the session: the kept receipt (written before either answer
 * below is shown, so never older), else what this process was answered, else the session as
 * History listed it (a loaded page or the saved history; no receipt needed). Null when unknown.
 */
function useServerSession(sessionId: string): FocusSession | null {
  const { user } = useSession();
  const receipts = useCompletionReceiptsSnapshot();
  const outbox = useSessionOutboxSnapshot();
  const notes = useSessionNotesSnapshot();
  const listed = useHistoryItem(sessionId);
  const receipt = receipts.userId === user?.id ? receiptFor(receipts, sessionId) : null;
  return receipt ?? notes.confirmed[sessionId] ?? outbox.synced[sessionId] ?? listed ?? null;
}

function useKnownSession(sessionId: string): Known {
  const { user } = useSession();
  const outbox = useSessionOutboxSnapshot();
  const receipts = useCompletionReceiptsSnapshot();
  const timers = useActiveTimer();
  const server = useServerSession(sessionId);
  const listed = useHistoryItem(sessionId);
  if (server) {
    return {
      kind: 'server',
      topicId: server.topicId,
      focusedMilliseconds: server.focusedMilliseconds,
      session: server,
      topic: listed?.topic ?? null,
    };
  }
  const queued = outbox.items.find((item) => item.id === sessionId);
  if (queued) {
    return {
      kind: 'device',
      topicId: queued.payload.topicId,
      focusedMilliseconds: focusedMillisecondsOf(queued.payload),
    };
  }
  const settled =
    outbox.status === 'ready' &&
    outbox.userId === user?.id &&
    receipts.status !== 'inactive' &&
    receipts.status !== 'restoring' &&
    receipts.userId === user?.id &&
    timers.status === 'ready' &&
    timers.userId === user?.id;
  // Not read yet, or its timer is still ending and being handed off.
  if (!settled || timers.timer?.id === sessionId) return { kind: 'saving' };
  return { kind: 'missing' };
}

/** Title and the plain explanation that goes with it (docs/02: never "failed"). */
function outcomeOf(known: Known & { kind: 'server' | 'device' }) {
  if (known.kind === 'device') {
    // Offline: no growth, goal, or streak is claimed before the server answers (M3.2).
    return {
      title: 'Focus session finished',
      detail: 'Saved on this device. Your tree and progress update once it syncs.',
    };
  }
  if (known.session.status === 'completed') return { title: 'Session complete', detail: null };
  if (known.session.status === 'discarded') {
    return {
      title: 'Focus session saved',
      detail: 'This session was shorter than the minimum for counted focus time.',
    };
  }
  return { title: 'Focus session saved', detail: null };
}

const minutesText = (minutes: number) => `${minutes} minute${minutes === 1 ? '' : 's'}`;

/** Back to Home: the screen under this one, or Home itself when it was opened alone. */
function useLeave() {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
}

/**
 * Session Completion, Phase 2 basic (docs/05): the outcome, the time focused, an optional note,
 * and Done. It shows the server's evaluation when the device has it (this process's answer, or
 * the receipt kept from an earlier one), and until then only what the device measured. With the
 * server's answer it adds what the session did to the tree (M3.2, `CompletionGrowth`) and the
 * server's daily goal and streak.
 */
export function CompletionScreen({ sessionId }: { sessionId: string }) {
  const theme = useTheme();
  const known = useKnownSession(sessionId);
  const leave = useLeave();

  if (known.kind === 'saving') {
    return (
      <Screen>
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          Saving your session.
        </Text>
      </Screen>
    );
  }
  if (known.kind === 'missing') {
    return (
      <Screen>
        <Text style={[theme.type.body, { color: theme.colors.text.primary }]}>
          This session isn&apos;t on this device.
        </Text>
        <Button variant="secondary" label="Back to Home" onPress={leave} />
      </Screen>
    );
  }
  return <CompletionContent sessionId={sessionId} known={known} onDone={leave} />;
}

function CompletionContent({
  sessionId,
  known,
  onDone,
}: {
  sessionId: string;
  known: Known & { kind: 'server' | 'device' };
  onDone: () => void;
}) {
  const theme = useTheme();
  const { user } = useSession();
  const notes = useSessionNotes();
  const notesSnapshot = useSessionNotesSnapshot();
  const server = useServerSession(sessionId);
  const topic = useTopicIdentity(known.topicId) ?? (known.kind === 'server' ? known.topic : null);
  const { title, detail } = outcomeOf(known);
  const minutes = Math.floor(Math.max(0, known.focusedMilliseconds) / MINUTE);

  const queuedNote = notesSnapshot.items.find((item) => item.sessionId === sessionId);
  // A note still waiting on the device is newer than anything the server confirmed.
  const savedNote = queuedNote ? queuedNote.note : (server?.note ?? null);
  // What the user is typing; null until they type, so an upgrade never replaces it.
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [savedHere, setSavedHere] = useState(false);
  const value = draft ?? savedNote ?? '';

  // docs/11: the outcome is announced, and again if the server's answer changes it.
  const announced = useRef<string | null>(null);
  const spoken = `${title}. ${minutesText(minutes)} focused.`;
  useEffect(() => {
    if (announced.current === spoken) return;
    announced.current = spoken;
    announce(spoken);
  }, [spoken]);

  /** Stores the typed note on the device (it is sent later). False when it could not be. */
  const saveNote = async (): Promise<boolean> => {
    if (draft === null || canonicalNote(draft) === savedNote) return true;
    const invalid = noteError(draft);
    if (invalid) {
      setProblem(invalid);
      return false;
    }
    const saved = user ? await notes.save(user.id, sessionId, draft) : null;
    if (!saved?.ok) {
      setProblem("We couldn't save your note on this device. Try again.");
      return false;
    }
    setProblem(null);
    setDraft(null);
    setSavedHere(true);
    return true;
  };

  const noteStatus =
    queuedNote?.state === 'needs_attention'
      ? 'This note is still saved on this device and needs attention before it can sync.'
      : queuedNote
        ? 'Note saved on this device.'
        : savedHere
          ? 'Note saved.'
          : null;

  return (
    <Screen title={title}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
        <TopicMark icon={topic?.icon ?? NEW_TOPIC_DEFAULTS.icon} color={topic?.color ?? null} />
        <Text style={[theme.type.bodyStrong, { color: theme.colors.text.primary, flexShrink: 1 }]}>
          {topic?.name ?? UNKNOWN_TOPIC_NAME}
        </Text>
      </View>
      <Text style={[theme.type.headline, { color: theme.colors.text.primary }]}>
        {`${minutes} min focused`}
      </Text>
      {detail ? (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>{detail}</Text>
      ) : null}
      <CompletionGrowth
        sessionId={sessionId}
        session={known.kind === 'server' ? known.session : null}
      />

      <View style={{ gap: theme.space[3] }}>
        <Input
          label="Note"
          value={value}
          onChangeText={(text) => {
            setDraft(text);
            setProblem(null);
          }}
          helper="Optional. Only you can see it."
          error={problem ?? undefined}
          multiline
        />
        {noteStatus ? <InlineStatus tone="info" message={noteStatus} /> : null}
        <Button variant="secondary" label="Save note" onPress={() => void saveNote()} />
      </View>

      <Button
        variant="primary"
        label="Done"
        onPress={() => {
          // The note is stored on the device first; the network is never waited for.
          void saveNote().then((ok) => {
            if (ok) onDone();
          });
        }}
      />
    </Screen>
  );
}
