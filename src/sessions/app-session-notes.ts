import AsyncStorage from '@react-native-async-storage/async-storage';

import { updateSessionNote, type ApiClient } from '../api';
import type { ActiveTimerStore } from '../timer/active-timer-store';
import type { CompletionReceipts } from './completion-receipts';
import type { SessionOutbox } from './session-outbox';
import { SessionNoteOutbox } from './session-note-outbox';

/**
 * Whether the server has confirmed a session, for its note: not while the timer still holds it
 * (running, paused, or finished and not handed off yet), not while it is in the outbox, and yes
 * once it has left the outbox, which happens only after a validated answer. Null while the
 * timer or the outbox is not read for that user.
 */
export function sessionConfirmedOnServer({
  sessions,
  timers,
}: {
  sessions: SessionOutbox;
  timers: ActiveTimerStore;
}): (userId: string, sessionId: string) => boolean | null {
  return (userId, sessionId) => {
    const timer = timers.getSnapshot();
    const outbox = sessions.getSnapshot();
    if (timer.status !== 'ready' || timer.userId !== userId) return null;
    if (outbox.status !== 'ready' || outbox.userId !== userId) return null;
    if (timer.timer?.id === sessionId) return false;
    return !outbox.items.some((item) => item.id === sessionId);
  };
}

/**
 * The note queue wired to the API, the timer, and the session outbox (see
 * `sessionConfirmedOnServer`). The answer to a note is kept as the session's completion receipt
 * before the note leaves the queue.
 */
export function createAppSessionNotes({
  client,
  sessions,
  timers,
  receipts,
}: {
  client: ApiClient;
  sessions: SessionOutbox;
  timers: ActiveTimerStore;
  receipts: CompletionReceipts;
}): SessionNoteOutbox {
  return new SessionNoteOutbox({
    storage: AsyncStorage,
    now: Date.now,
    report: (issue) => console.warn(`[sessions] session notes: ${issue.code}`),
    send: (id, note) => updateSessionNote(client, id, note),
    isSessionConfirmed: sessionConfirmedOnServer({ sessions, timers }),
    keepReceipt: (userId, session) => receipts.keep(userId, session),
  });
}
