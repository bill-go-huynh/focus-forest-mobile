import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  getSessionHistory,
  NetworkError,
  setSessionNoteHighlight,
  useApi,
  useSession,
  type FocusSession,
} from '../api';
import { Button } from '../components/Button';
import { InlineStatus } from '../components/InlineStatus';
import { invalidateHistory } from '../history/query-keys';
import { useCompletionReceipts } from '../sessions/CompletionReceiptsProvider';
import { useTheme } from '../theme';

export const HIGHLIGHTED_TEXT = 'Highlighted. It is kept in the monthly recap when the month ends.';
const OFFLINE_TEXT = 'Highlighting needs a connection. Nothing was changed.';
const REFUSED_TEXT = {
  highlight: "This note couldn't be highlighted. Nothing was changed.",
  remove: "The highlight couldn't be removed. Nothing was changed.",
};

/**
 * Highlights a saved note for its month's recap, or removes the highlight (X3.G). The control is
 * offered (`available`) only for a server session whose saved note is the one on screen; a
 * message about the last attempt stays after the control is no longer offered. The server
 * decides: nothing changes here until it answers, its answer is kept as the session's receipt
 * (which the screen reads), and there is no offline queue. After a refusal the session is read
 * again from History, so the screen shows the server's state, never a guess.
 */
export function NoteHighlight({
  session,
  available,
}: {
  session: FocusSession;
  available: boolean;
}) {
  const theme = useTheme();
  const { client } = useApi();
  const { user } = useSession();
  const receipts = useCompletionReceipts();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const highlighted = available && session.noteHighlighted === true;

  /** The session as the server has it now, from its day in History. */
  const reread = async (userId: string) => {
    try {
      const page = await getSessionHistory(client, {
        cursor: null,
        filters: { from: session.localDate, to: session.localDate },
      });
      const item = page.items.find((listed) => listed.id === session.id);
      if (item) {
        const { topic: _topic, ...answer } = item;
        await receipts.keep(userId, answer);
      }
    } catch {
      // The receipt stays as the server last answered it.
    }
    void invalidateHistory(queryClient);
  };

  const change = async () => {
    if (busy || !user || !available) return;
    const userId = user.id;
    setBusy(true);
    setProblem(null);
    try {
      const answer = await setSessionNoteHighlight(client, session.id, !highlighted);
      await receipts.keep(userId, answer);
      void invalidateHistory(queryClient);
    } catch (error) {
      if (error instanceof NetworkError) {
        setProblem(OFFLINE_TEXT);
      } else {
        setProblem(highlighted ? REFUSED_TEXT.remove : REFUSED_TEXT.highlight);
        await reread(userId);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: theme.space[2] }}>
      {highlighted ? (
        <Text style={[theme.type.body, { color: theme.colors.text.secondary }]}>
          {HIGHLIGHTED_TEXT}
        </Text>
      ) : null}
      {problem ? <InlineStatus tone="info" message={problem} /> : null}
      {available ? (
        <Button
          variant="tertiary"
          label={highlighted ? 'Remove from monthly recap' : 'Highlight in monthly recap'}
          onPress={() => void change()}
        />
      ) : null}
    </View>
  );
}
