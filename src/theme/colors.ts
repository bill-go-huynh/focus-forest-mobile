/**
 * Semantic color tokens (docs/01_DESIGN_SYSTEM.md §2).
 *
 * PROVISIONAL: Phase 0 has not set the palette yet. These values follow the documented
 * intent ("quiet garden at golden hour" by day, "night garden" by night) and are
 * contrast-tested (src/theme/__tests__/tokens.test.ts), but they are not final.
 * Replace them when Phase 0 confirms the palette; the token names stay the same.
 */

type TopicColors = Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12, string>;

export interface ColorTokens {
  background: { primary: string; secondary: string };
  surface: { primary: string; elevated: string; sunken: string; scene: string };
  text: { primary: string; secondary: string; muted: string; inverse: string; accent: string };
  accent: { primary: string; primaryPressed: string; soft: string };
  forest: { primary: string; soft: string; deep: string };
  bloom: string;
  glow: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  border: { subtle: string; default: string; focus: string };
  overlay: { scrim: string };
  /** Curated topic colors: always shown with the topic's icon or name, never alone. */
  topic: TopicColors;
}

/** Day garden: warm paper backgrounds, sunlit amber accents. */
export const lightColors: ColorTokens = {
  background: { primary: '#F7F3EA', secondary: '#EFE8DA' },
  surface: { primary: '#FFFCF6', elevated: '#FFFEFB', sunken: '#EBE4D6', scene: '#E8E3D1' },
  text: {
    primary: '#2B2620',
    secondary: '#4D453B',
    muted: '#665D51',
    inverse: '#FFFCF6',
    accent: '#7A4A08',
  },
  accent: { primary: '#9C5B0C', primaryPressed: '#7F4906', soft: '#F6E7CB' },
  forest: { primary: '#3B7349', soft: '#DDEAD8', deep: '#1F3D2B' },
  bloom: '#D9776C',
  glow: '#FFF0C7',
  success: '#2F7A57',
  warning: '#9A6A12',
  danger: '#9E3B31',
  info: '#3E6C8A',
  border: { subtle: '#E2D9C8', default: '#8A7F70', focus: '#1F5C99' },
  overlay: { scrim: '#1C181266' },
  topic: {
    1: '#5E7F4E',
    2: '#9A5B3C',
    3: '#4C7A99',
    4: '#7D5A8C',
    5: '#8C7440',
    6: '#4F8378',
    7: '#A0555E',
    8: '#6B6FA0',
    9: '#7A7A45',
    10: '#3F7F8F',
    11: '#8E6A55',
    12: '#5F7A6A',
  },
};

/** Night garden: deep night-moss (never pure black), moonlit highlights. */
export const darkColors: ColorTokens = {
  background: { primary: '#16201C', secondary: '#1B2621' },
  surface: { primary: '#212D28', elevated: '#28362F', sunken: '#111915', scene: '#0F1916' },
  text: {
    primary: '#F2EDE3',
    secondary: '#D3CCBF',
    muted: '#AAA395',
    inverse: '#16201C',
    accent: '#EBBD6A',
  },
  accent: { primary: '#E3A63F', primaryPressed: '#C98E2C', soft: '#3A3220' },
  forest: { primary: '#7FBA8B', soft: '#233A2C', deep: '#9CCBA6' },
  bloom: '#E59A90',
  glow: '#F5E3A8',
  success: '#7CC39B',
  warning: '#E0B55C',
  danger: '#E58C80',
  info: '#8DB7D6',
  border: { subtle: '#2F3D36', default: '#7E8A82', focus: '#8EC3F0' },
  overlay: { scrim: '#05090799' },
  topic: {
    1: '#8FB57E',
    2: '#D39576',
    3: '#86B3D1',
    4: '#B596C4',
    5: '#C9AE74',
    6: '#86BDB1',
    7: '#D68C95',
    8: '#A3A7D6',
    9: '#B5B57A',
    10: '#7CB9C8',
    11: '#C9A38D',
    12: '#98B5A4',
  },
};
