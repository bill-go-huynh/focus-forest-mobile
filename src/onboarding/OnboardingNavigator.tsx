import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useSession } from '../api';
import { useOnboarding } from './OnboardingProvider';

/**
 * Opens onboarding above Home for a user whose onboarding is pending (marked only at sign-up),
 * once per launch: after sign-up, or after a kill mid-way, where it resumes at the stored step.
 * Never over Focus or Completion; a user with no record (an existing account) never sees it.
 */
export function OnboardingNavigator() {
  const { status, onboarding, userId } = useOnboarding();
  const { user } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'ready' || !user || userId !== user.id) return;
    if (onboarding?.status !== 'pending' || opened.current === user.id) return;
    if (pathname === '/onboarding') {
      opened.current = user.id;
      return;
    }
    if (pathname !== '/') return;
    opened.current = user.id;
    router.push('/onboarding');
  }, [status, onboarding, userId, user, pathname, router]);

  return null;
}
