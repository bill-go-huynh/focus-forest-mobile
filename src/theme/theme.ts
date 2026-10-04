import { darkColors, lightColors, type ColorTokens } from './colors';
import {
  avatar,
  control,
  easing,
  elevationFor,
  icon,
  illustration,
  interaction,
  lineIcon,
  motion,
  opacity,
  progressRing,
  radius,
  space,
  spring,
  treeScene,
  type,
  type ElevationTokens,
} from './tokens';

/** Which values are still waiting for Phase 0 decisions. Nothing here is final yet. */
export const themeValueStatus = {
  colors: 'provisional',
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
