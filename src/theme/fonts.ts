import { useFonts } from 'expo-font';

/**
 * The bundled faces (docs/01 §3; owner decision 2026-10-16): Fraunces for display text, Inter
 * for everything else. Static faces, one per weight, named `<Family>-<Weight>`: on Android a
 * custom font's weight is chosen by its family name, not by `fontWeight`. Both are under the
 * SIL Open Font License 1.1 (`assets/fonts/OFL-*.txt`), static instances from Google Fonts.
 */
export const FONT_ASSETS = {
  'Fraunces-Light': require('../../assets/fonts/Fraunces-Light.ttf') as number,
  'Fraunces-Regular': require('../../assets/fonts/Fraunces-Regular.ttf') as number,
  'Inter-Light': require('../../assets/fonts/Inter-Light.ttf') as number,
  'Inter-Regular': require('../../assets/fonts/Inter-Regular.ttf') as number,
  'Inter-Medium': require('../../assets/fonts/Inter-Medium.ttf') as number,
  'Inter-SemiBold': require('../../assets/fonts/Inter-SemiBold.ttf') as number,
} as const;

export type FontFamily = keyof typeof FONT_ASSETS;

/**
 * True once the faces are loaded, or once loading failed: a missing face falls back to the
 * system font and never keeps the app on its launch screen.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(FONT_ASSETS);
  return loaded || error !== null;
}
