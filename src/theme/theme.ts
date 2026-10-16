import { darkColors, lightColors, type ColorTokens } from './colors';
import {
  avatar,
  badge,
  control,
  easing,
  elevationFor,
  icon,
  illustration,
  interaction,
  lineIcon,
  motion,
  opacity,
  progressBar,
  progressRing,
  radius,
  space,
  spring,
  treeScene,
  type,
  type ElevationTokens,
} from './tokens';

/**
 * Which values are decided. Colors are final (decided 2026-10-17, ART.9: the contrast-tested
 * palette of the art direction canvas). Type sizes and easing curves wait for the device review.
 */
export const themeValueStatus = {
  colors: 'final',
  typography: 'provisional',
  easing: 'provisional',
} as const;

export type ColorSchemeName = 'light' | 'dark';

export interface Theme {
  scheme: ColorSchemeName;
  colors: ColorTokens;
  elevation: ElevationTokens;
  space: typeof space;
  radius: typeof radius;
  icon: typeof icon;
  opacity: typeof opacity;
  type: typeof type;
  motion: typeof motion;
  easing: typeof easing;
  spring: typeof spring;
  control: typeof control;
  interaction: typeof interaction;
  progressRing: typeof progressRing;
  progressBar: typeof progressBar;
  badge: typeof badge;
  illustration: typeof illustration;
  lineIcon: typeof lineIcon;
  avatar: typeof avatar;
  treeScene: typeof treeScene;
}

const shared = {
  space,
  radius,
  icon,
  opacity,
  type,
  motion,
  easing,
  spring,
  control,
  interaction,
  progressRing,
  progressBar,
  badge,
  illustration,
  lineIcon,
  avatar,
  treeScene,
};

export const lightTheme: Theme = {
  scheme: 'light',
  colors: lightColors,
  // Warm-tinted shadows (the bark ink color), never grey-blue.
  elevation: elevationFor(lightColors.text.primary, 1),
  ...shared,
};

export const darkTheme: Theme = {
  scheme: 'dark',
  colors: darkColors,
  elevation: elevationFor('#000000', 0.5),
  ...shared,
};
