import { renderHook } from '@testing-library/react-native';
import * as ExpoFont from 'expo-font';

import { FONT_ASSETS, useAppFonts } from '../fonts';
import { type } from '../tokens';

/* eslint-disable @typescript-eslint/no-require-imports */
const { readdirSync } = require('node:fs') as { readdirSync: (path: string) => string[] };
const { join } = require('node:path') as { join: (...parts: string[]) => string };
/* eslint-enable @typescript-eslint/no-require-imports */
declare const __dirname: string;

jest.mock('expo-font', () => ({ useFonts: jest.fn(() => [true, null]) }));
const useFonts = jest.mocked(ExpoFont.useFonts);

/**
 * The font pairing (docs/01 §3; owner decision 2026-10-16): Fraunces, a soft humanist serif,
 * for display only; Inter for everything else. Static faces, one per weight, because a custom
 * font's weight is chosen by its family name on Android.
 */
describe('fonts', () => {
  const WEIGHTS: Record<string, string> = {
    Light: '300',
    Regular: '400',
    Medium: '500',
    SemiBold: '600',
  };

  it('gives every type token a bundled face of its own weight', () => {
    for (const token of Object.values(type)) {
      expect(Object.keys(FONT_ASSETS)).toContain(token.fontFamily);
      const weight = token.fontFamily.split('-')[1]!;
      expect(WEIGHTS[weight]).toBe(token.fontWeight);
    }
  });

  it('sets the display serif only on display text, Inter everywhere else', () => {
    for (const [name, token] of Object.entries(type)) {
      expect(token.fontFamily.startsWith(name === 'display' ? 'Fraunces-' : 'Inter-')).toBe(true);
    }
  });

  it('bundles exactly the faces it names, with their licenses', () => {
    const dir = join(__dirname, '..', '..', '..', 'assets', 'fonts');
    const files = readdirSync(dir);
    expect(files.filter((f) => f.endsWith('.ttf')).sort()).toEqual(
      Object.keys(FONT_ASSETS)
        .map((name) => `${name}.ttf`)
        .sort(),
    );
    expect(files).toEqual(expect.arrayContaining(['OFL-Fraunces.txt', 'OFL-Inter.txt']));
  });

  it('is ready once the faces load', () => {
    useFonts.mockReturnValue([false, null]);
    expect(renderHook(() => useAppFonts()).result.current).toBe(false);
    useFonts.mockReturnValue([true, null]);
    expect(renderHook(() => useAppFonts()).result.current).toBe(true);
  });

  it('never blocks the app when a face fails to load: the system font is used', () => {
    useFonts.mockReturnValue([false, new Error('missing')]);
    expect(renderHook(() => useAppFonts()).result.current).toBe(true);
  });
});
