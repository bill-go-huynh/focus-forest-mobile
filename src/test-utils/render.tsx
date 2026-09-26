import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type EdgeInsets } from 'react-native-safe-area-context';

import { AccessibilityProvider } from '../accessibility';
import { ThemeProvider } from '../theme';

/** Safe-area insets of a notched phone, so layouts that pad for them can be tested. */
export const TEST_SAFE_AREA_INSETS: EdgeInsets = { top: 47, right: 0, bottom: 34, left: 0 };
export const TEST_WINDOW = { width: 390, height: 844 };

/**
 * Renders UI inside the app's theme, accessibility, and safe-area providers. The color
 * scheme comes from `useColorScheme`, which tests mock with `mockColorScheme`.
 */
export function renderWithProviders(
  ui: ReactElement,
  { reducedMotion = false, ...options }: RenderOptions & { reducedMotion?: boolean } = {},
) {
  function Providers({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider>
        <AccessibilityProvider appReducedMotion={reducedMotion}>
          <SafeAreaProvider
            initialMetrics={{
              frame: { x: 0, y: 0, ...TEST_WINDOW },
              insets: TEST_SAFE_AREA_INSETS,
            }}
          >
            {children}
          </SafeAreaProvider>
        </AccessibilityProvider>
      </ThemeProvider>
    );
  }
  return render(ui, { wrapper: Providers, ...options });
}

/**
 * Host refs are null in the test renderer unless a node mock is provided. This mock keeps
 * the element's props, so tests can check which element received accessibility focus.
 */
export function createNodeMock(element: ReactElement) {
  return { props: element.props as Record<string, unknown> };
}
