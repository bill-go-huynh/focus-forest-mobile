import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useSession } from '../api';
import { appRouteForLink } from '../navigation/notification-links';
import { onOsPushTap } from './os-push';

/**
 * Opens what a tapped notification links to (M6.2; docs/05 §4): while the app runs, and the
 * tap that launched it. A tap before sign-in waits until someone is signed in. The link opens
 * only for the account the notification was for (`recipient`; owner, 2026-10-21); anyone else
 * gets Home. A push from before recipients (none named) opens only for the account signed in
 * when it was tapped. A link the app does not know opens Home. The tab's own screen stays
 * beneath (`unstable_settings`), so back leads there. The timer's own taps are left to the
 * completion (M2.12). Renders nothing.
 */
export function NotificationLinkNavigator() {
  const router = useRouter();
  const { status, user } = useSession();
  const userId = status === 'authenticated' ? (user?.id ?? null) : null;
  // Who is signed in when a tap arrives, for a push that names no recipient.
  const signedIn = useRef(userId);
  useEffect(() => {
    signedIn.current = userId;
  }, [userId]);
  // The latest tap, numbered so the same link tapped again opens again; `opened` is the last
  // number followed.
  const [tap, setTap] = useState<{ route: string; for: string | null; n: number } | null>(null);
  const opened = useRef(0);

  useEffect(
    () =>
      onOsPushTap(({ link, recipient }) =>
        setTap((last) => ({
          route: appRouteForLink(link),
          for: recipient ?? signedIn.current,
          n: (last?.n ?? 0) + 1,
        })),
      ),
    [],
  );

  useEffect(() => {
    if (!tap || !userId || opened.current === tap.n) return;
    opened.current = tap.n;
    if (tap.for !== userId) {
      router.navigate('/');
      return;
    }
    // With the anchor, the tab's own screen (`unstable_settings`) is beneath, for back.
    router.push(tap.route as Href, { withAnchor: true });
  }, [tap, userId, router]);

  return null;
}
