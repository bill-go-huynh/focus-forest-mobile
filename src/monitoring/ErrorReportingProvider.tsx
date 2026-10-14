import { usePathname } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';

import { useSession } from '../api';
import { usePreferences } from '../preferences/queries';
import { AppErrorBoundary } from './AppErrorBoundary';
import type { ErrorReporter } from './error-reporter';

interface GlobalErrorUtils {
  getGlobalHandler: () => (error: Error, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
}

/**
 * Error reporting for the app (M7.2): a calm fallback for a screen that fails, crash reports for
 * render errors and uncaught JavaScript errors, all sent only while the signed-in person shares
 * usage data (unknown while signed out: held, never sent). Place it inside the theme providers.
 */
export function ErrorReportingProvider({
  reporter,
  children,
}: {
  reporter: ErrorReporter;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { user } = useSession();
  const preferences = usePreferences({ enabled: !!user });
  const screenRef = useRef(pathname);
  useEffect(() => {
    screenRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    reporter.setSharing(user ? preferences.data?.shareUsageData : undefined);
  }, [reporter, user, preferences.data?.shareUsageData]);

  // Uncaught errors outside rendering (event handlers, promises the app forgot), then the default.
  useEffect(() => {
    const utils = (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
    if (!utils) return;
    const previous = utils.getGlobalHandler();
    utils.setGlobalHandler((error, isFatal) => {
      reporter.report({
        kind: 'crash',
        message: `${error.name}: ${error.message}`,
        stack: error.stack ?? null,
        screen: screenRef.current,
      });
      previous(error, isFatal);
    });
    return () => utils.setGlobalHandler(previous);
  }, [reporter]);

  return (
    <AppErrorBoundary
      screen={pathname}
      onError={(error, info) =>
        reporter.report({
          kind: 'crash',
          message: `${error.name}: ${error.message}`,
          stack: error.stack ?? info.componentStack ?? null,
          screen: pathname,
        })
      }
    >
      {children}
    </AppErrorBoundary>
  );
}
