import type { ReactNode } from 'react';

import { AccessibilityProvider } from '../accessibility';
import { useSession } from '../api';
import { HapticsProvider } from '../haptics/haptics';
import { ThemeProvider } from '../theme';
import { usePreferences } from './queries';

/**
 * Applies the signed-in user's theme, reduced-motion and haptics preferences (A5) to the whole
 * app. Signed out, or before the preferences arrive, the A5 defaults apply: follow the system
 * theme, and reduce motion only when the device asks for it. Haptics wait for the setting.
 */
export function AppearanceProviders({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const { data } = usePreferences({ enabled: status === 'authenticated' });
  const signedIn = status === 'authenticated';
  return (
    <ThemeProvider preference={signedIn ? (data?.theme ?? 'system') : 'system'}>
      <AccessibilityProvider appReducedMotion={signedIn && (data?.reducedMotion ?? false)}>
        <HapticsProvider enabled={signedIn && data?.haptics === true}>{children}</HapticsProvider>
      </AccessibilityProvider>
    </ThemeProvider>
  );
}

/**
 * True while a signed-in launch is still reading the preferences for the first time, so the
 * app can wait instead of flashing the wrong theme. It stops waiting after one failed read.
 */
export function useWaitingForPreferences(): boolean {
  const { status } = useSession();
  const query = usePreferences({ enabled: status === 'authenticated' });
  return status === 'authenticated' && query.isPending && query.failureCount === 0;
}
