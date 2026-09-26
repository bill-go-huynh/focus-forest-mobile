import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from './theme';

const ThemeContext = createContext<Theme | null>(null);

/** The theme preference (A5): follow the system, or always light or dark. */
export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * Provides the theme (docs/01_DESIGN_SYSTEM.md §10). It follows the system color scheme
 * unless the app preference chooses light or dark.
 */
export function ThemeProvider({
  preference = 'system',
  children,
}: {
  preference?: ThemePreference;
  children: ReactNode;
}) {
  const system = useColorScheme();
  const scheme = preference === 'system' ? system : preference;
  return (
    <ThemeContext.Provider value={scheme === 'dark' ? darkTheme : lightTheme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside a ThemeProvider.');
  return theme;
}
