import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useSession } from '../api';
import { appRouteForLink } from '../navigation/notification-links';
import { onOsPushTap } from './os-push';

/**
 * Opens what a tapped notification links to (M6.2; docs/05 §4): while the app runs, and the
 * tap that launched it. A tap before sign-in waits until someone is signed in. A link the app
 * does not know opens Home. The tab's own screen stays beneath (`unstable_settings`), so back
 * leads there. The timer's own taps are left to the completion (M2.12). Renders nothing.
 */
export function NotificationLinkNavigator() {
  const router = useRouter();
  const { status } = useSession();
  // The latest tap, numbered so the same link tapped again opens again; `opened` is the last
  // number followed.
  const [tap, setTap] = useState<{ route: string; n: number } | null>(null);
  const opened = useRef(0);

  useEffect(
    () =>
      onOsPushTap((link) =>
        setTap((last) => ({ route: appRouteForLink(link), n: (last?.n ?? 0) + 1 })),
      ),
    [],
  );

  useEffect(() => {
    if (!tap || status !== 'authenticated' || opened.current === tap.n) return;
    opened.current = tap.n;
    // With the anchor, the tab's own screen (`unstable_settings`) is beneath, for back.
    router.push(tap.route as Href, { withAnchor: true });
  }, [tap, status, router]);

  return null;
}
