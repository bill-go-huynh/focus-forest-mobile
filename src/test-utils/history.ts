import type { SessionHistoryItem } from '../api/history';
import { TOPIC_COLORS } from '../api/topics';
import { makeSessionResult } from './sessions';

/** A history item exactly as GET /me/sessions answers it (A2.7): a session plus its topic now. */
export function makeHistoryItem(overrides: Partial<SessionHistoryItem> = {}): SessionHistoryItem {
  const session = makeSessionResult();
  return {
    ...session,
    topic: {
      id: session.topicId,
      name: 'Reading',
      icon: 'book',
      color: TOPIC_COLORS[2] as string,
      status: 'active',
    },
    ...overrides,
  };
}
