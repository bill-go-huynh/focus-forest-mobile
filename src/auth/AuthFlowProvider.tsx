import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Sign-up is more than creating the account: the display name and time zone are saved
 * right after (A4). While that runs the session is already authenticated, so this flag keeps
 * the auth screens up until setup finishes. Only then does the app move to Home.
 */
interface AuthFlow {
  completingSignUp: boolean;
  setCompletingSignUp: (value: boolean) => void;
}

const AuthFlowContext = createContext<AuthFlow | null>(null);

export function AuthFlowProvider({ children }: { children: ReactNode }) {
  const [completingSignUp, setCompletingSignUp] = useState(false);
  const value = useMemo(() => ({ completingSignUp, setCompletingSignUp }), [completingSignUp]);
  return <AuthFlowContext.Provider value={value}>{children}</AuthFlowContext.Provider>;
}

export function useAuthFlow(): AuthFlow {
  const flow = useContext(AuthFlowContext);
  if (!flow) throw new Error('useAuthFlow must be used inside AuthFlowProvider.');
  return flow;
}
