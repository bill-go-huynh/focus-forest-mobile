import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { markWelcomeDone, readWelcomeDone } from './welcome-store';

interface WelcomeState {
  /** Null until read at launch. */
  done: boolean | null;
  markDone: () => void;
}

const WelcomeContext = createContext<WelcomeState | null>(null);

/** Whether a signed-out launch opens the welcome (W.1), read once at launch. */
export function WelcomeProvider({ children }: { children: ReactNode }) {
  const [done, setDone] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void readWelcomeDone().then((value) => {
      if (live) setDone((current) => current ?? value);
    });
    return () => {
      live = false;
    };
  }, []);
  const value = useMemo(
    () => ({
      done,
      markDone: () => {
        setDone(true);
        void markWelcomeDone();
      },
    }),
    [done],
  );
  return <WelcomeContext.Provider value={value}>{children}</WelcomeContext.Provider>;
}

export function useWelcome(): WelcomeState {
  const state = useContext(WelcomeContext);
  if (!state) throw new Error('useWelcome must be used inside WelcomeProvider.');
  return state;
}
