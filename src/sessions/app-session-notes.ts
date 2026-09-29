import AsyncStorage from '@react-native-async-storage/async-storage';

import { updateSessionNote, type ApiClient } from '../api';
import type { CompletionReceipts } from './completion-receipts';
import type { SessionOutbox } from './session-outbox';
import { SessionNoteOutbox } from './session-note-outbox';

/**
 * The note queue wired to the API and the session outbox: a session is confirmed on the server
 * once it has left the (read) outbox, which happens only after a validated answer. The answer
 * to a note is kept as the session's completion receipt before the note leaves the queue.
 */
export function createAppSessionNotes({
  client,
  sessions,
  receipts,
}: {
  client: ApiClient;
  sessions: SessionOutbox;
  receipts: CompletionReceipts;
}): SessionNoteOutbox {
  return new SessionNoteOutbox({
    storage: AsyncStorage,
    now: Date.now,
    report: (issue) => console.warn(`[sessions] session notes: ${issue.code}`),
    send: (id, note) => updateSessionNote(client, id, note),
    isSessionConfirmed: (userId, id) => {
      const { status, userId: owner, items } = sessions.getSnapshot();
      if (status !== 'ready' || owner !== userId) return null;
      return !items.some((item) => item.id === id);
    },
    keepReceipt: (userId, session) => receipts.keep(userId, session),
  });
}
