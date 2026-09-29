import { useLocalSearchParams } from 'expo-router';

import { CompletionScreen } from '../../completion/CompletionScreen';

/** Session Completion (docs/05): a full-screen takeover outside the tabs, for one session. */
export default function CompletionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <CompletionScreen sessionId={sessionId} />;
}
