import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { useSession } from '../api';
import { useActiveTimer } from '../timer/ActiveTimerProvider';
import { useSessionOutboxSnapshot } from './SessionOutboxProvider';
import type { SessionNoteOutbox, SessionNoteOutboxSnapshot } from './session-note-outbox';

const NotesContext = createContext<SessionNoteOutbox | null>(null);

/**
 * Reads the signed-in user's queued notes and sends them once their sessions are on the server:
 * when both queues and the timer are read, whenever the session outbox changes (a session
 * synced), when the timer lets a session go, and after each saved note. Sign-out forgets them
 * in memory; storage keeps them. Place it inside `ActiveTimerProvider` and
 * `SessionOutboxProvider`.
 */
export function SessionNotesProvider({
  notes,
  children,
}: {
  notes: SessionNoteOutbox;
  children: ReactNode;
}) {
  const { status, user } = useSession();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;
  const sessions = useSessionOutboxSnapshot();
  const current = useSyncExternalStore(notes.subscribe, notes.getSnapshot);

  const timer = useActiveTimer();
  const timerReady = timer.status === 'ready' && timer.userId === userId;
  const heldSession = timer.timer?.id ?? null;
  const sessionsReady = sessions.status === 'ready' && sessions.userId === userId;
  const notesReady = userId !== null && current.status === 'ready' && current.userId === userId;
  const queuedSessions = sessions.items.map((item) => item.id).join(',');
  const queuedNotes = current.items.map((item) => `${item.sessionId}:${item.revision}`).join(',');

  useEffect(() => {
    if (userId) void notes.activate(userId);
    else notes.deactivate();
  }, [notes, userId]);

  useEffect(() => {
    if (timerReady && sessionsReady && notesReady) void notes.flush();
  }, [notes, timerReady, sessionsReady, notesReady, heldSession, queuedSessions, queuedNotes]);

  return <NotesContext.Provider value={notes}>{children}</NotesContext.Provider>;
}

export function useSessionNotes(): SessionNoteOutbox {
  const notes = useContext(NotesContext);
  if (!notes) throw new Error('useSessionNotes must be used inside SessionNotesProvider.');
  return notes;
}

/** The queued notes, and the ones this process confirmed. */
export function useSessionNotesSnapshot(): SessionNoteOutboxSnapshot {
  const notes = useSessionNotes();
  return useSyncExternalStore(notes.subscribe, notes.getSnapshot);
}
