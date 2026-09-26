import { contrastRatio } from '../contrast';
import { darkTheme, lightTheme, themeValueStatus, type Theme } from '../theme';

const themes: [string, Theme][] = [
  ['light', lightTheme],
  ['dark', darkTheme],
];

function flatten(value: unknown, prefix = ''): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return { [prefix]: value };
  return Object.entries(value).reduce<Record<string, unknown>>(
    (all, [key, entry]) => ({ ...all, ...flatten(entry, prefix ? `${prefix}.${key}` : key) }),
    {},
  );
}

const AA_TEXT = 4.5;
const AA_UI = 3;

describe('design tokens', () => {
  it('marks the values that Phase 0 has not confirmed as provisional', () => {
    expect(themeValueStatus).toEqual({
      colors: 'provisional',
      typography: 'provisional',
      easing: 'provisional',
    });
  });

  describe('colors', () => {
    it('define every semantic color token from docs/01 §2 in both themes', () => {
      const expected = [
        'background.primary',
        'background.secondary',
        'surface.primary',
        'surface.elevated',
        'surface.sunken',
        'surface.scene',
        'text.primary',
        'text.secondary',
        'text.muted',
        'text.inverse',
        'text.accent',
        'accent.primary',
        'accent.primaryPressed',
        'accent.soft',
        'forest.primary',
        'forest.soft',
        'forest.deep',
        'bloom',
        'glow',
        'success',
        'warning',
        'danger',
        'info',
        'border.subtle',
        'border.default',
        'border.focus',
        'overlay.scrim',
        ...Array.from({ length: 12 }, (_, i) => `topic.${i + 1}`),
      ].sort();
      expect(Object.keys(flatten(lightTheme.colors)).sort()).toEqual(expected);
      expect(Object.keys(flatten(darkTheme.colors)).sort()).toEqual(expected);
    });

    it.each(themes)('are hex values in the %s theme', (_name, theme) => {
      for (const value of Object.values(flatten(theme.colors))) {
        expect(value).toMatch(/^#[0-9A-F]{6}([0-9A-F]{2})?$/);
      }
    });

    it('give dark mode its own values instead of reusing light ones', () => {
      expect(darkTheme.colors.background.primary).not.toBe(lightTheme.colors.background.primary);
      expect(darkTheme.colors.text.primary).not.toBe(lightTheme.colors.text.primary);
    });

    it('never make dark backgrounds pure black', () => {
      expect(darkTheme.colors.background.primary).not.toBe('#000000');
    });
  });

  describe.each(themes)('WCAG AA contrast in the %s theme', (_name, theme) => {
    const c = theme.colors;
    const textSurfaces = {
      'background.primary': c.background.primary,
      'background.secondary': c.background.secondary,
      'surface.primary': c.surface.primary,
      'surface.elevated': c.surface.elevated,
      'surface.sunken': c.surface.sunken,
    };

    it.each(['primary', 'secondary', 'muted', 'accent'] as const)(
      'text.%s reaches 4.5:1 on every surface',
      (text) => {
        for (const surface of Object.values(textSurfaces)) {
          expect(contrastRatio(c.text[text], surface)).toBeGreaterThanOrEqual(AA_TEXT);
        }
      },
    );

    it('danger text reaches 4.5:1 on every surface', () => {
      for (const surface of Object.values(textSurfaces)) {
        expect(contrastRatio(c.danger, surface)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });

    it('text.inverse reaches 4.5:1 on the accent fills (primary button labels)', () => {
      expect(contrastRatio(c.text.inverse, c.accent.primary)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(c.text.inverse, c.accent.primaryPressed)).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    });

    it('text.primary reaches 4.5:1 on tinted fills and the scene backdrop', () => {
      expect(contrastRatio(c.text.primary, c.accent.soft)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(c.text.primary, c.forest.soft)).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrastRatio(c.text.primary, c.surface.scene)).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it('input outlines (rest, focus, error) reach 3:1 on the field fill (docs/11)', () => {
      for (const outline of [c.border.default, c.border.focus, c.danger]) {
        expect(contrastRatio(outline, c.surface.sunken)).toBeGreaterThanOrEqual(AA_UI);
      }
      expect(contrastRatio(c.text.muted, c.surface.sunken)).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it('meaningful UI colors reach 3:1 against what surrounds them', () => {
      expect(contrastRatio(c.border.default, c.surface.sunken)).toBeGreaterThanOrEqual(AA_UI);
      expect(contrastRatio(c.border.default, c.surface.primary)).toBeGreaterThanOrEqual(AA_UI);
      for (const surface of [c.background.primary, c.surface.primary, c.surface.sunken]) {
        expect(contrastRatio(c.border.focus, surface)).toBeGreaterThanOrEqual(AA_UI);
      }
      for (const surface of [c.background.primary, c.surface.primary]) {
        expect(contrastRatio(c.accent.primary, surface)).toBeGreaterThanOrEqual(AA_UI);
        expect(contrastRatio(c.forest.primary, surface)).toBeGreaterThanOrEqual(AA_UI);
      }
    });

    it('the selected-chip outline reaches 3:1 on the chip fill and on the surfaces around it', () => {
      for (const surface of [c.accent.soft, c.background.primary, c.surface.primary]) {
        expect(contrastRatio(c.accent.primary, surface)).toBeGreaterThanOrEqual(AA_UI);
      }
    });

    it('progress arcs reach 3:1 against their tracks (docs/11: meaningful UI)', () => {
      expect(contrastRatio(c.forest.primary, c.forest.soft)).toBeGreaterThanOrEqual(AA_UI);
      expect(contrastRatio(c.accent.primary, c.accent.soft)).toBeGreaterThanOrEqual(AA_UI);
    });

    it('topic colors reach 3:1 on cards, so the color dot stays visible', () => {
      for (const topic of Object.values(c.topic)) {
        expect(contrastRatio(topic, c.surface.primary)).toBeGreaterThanOrEqual(AA_UI);
      }
    });
  });

  describe('scales', () => {
    it('use exactly the documented 4-point spacing scale', () => {
      expect(lightTheme.space).toEqual({
        0: 0,
        1: 4,
        2: 8,
        3: 12,
        4: 16,
        5: 20,
        6: 24,
        8: 32,
        10: 40,
        12: 48,
        16: 64,
      });
    });

    it('use the documented radii and icon sizes', () => {
      expect(lightTheme.radius).toEqual({ sm: 8, md: 12, lg: 20, xl: 28, full: 9999 });
      expect(lightTheme.icon).toEqual({ sm: 16, md: 24, lg: 32 });
    });

    it('share spacing, radii, icons, motion, and type between themes', () => {
      for (const key of [
        'space',
        'radius',
        'icon',
        'motion',
        'easing',
        'spring',
        'type',
        'control',
        'interaction',
        'progressRing',
        'illustration',
        'lineIcon',
        'avatar',
      ] as const) {
        expect(darkTheme[key]).toEqual(lightTheme[key]);
      }
    });

    it('define opacity tokens between 0 and 1', () => {
      for (const value of Object.values(lightTheme.opacity)) {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThan(1);
      }
      expect(Object.keys(lightTheme.opacity).sort()).toEqual(['disabled', 'muted', 'scrim']);
    });
  });

  describe.each(themes)('elevation in the %s theme', (_name, theme) => {
    it('defines levels 0–3, with level 0 flat and depth increasing', () => {
      expect(Object.keys(theme.elevation)).toEqual(['0', '1', '2', '3']);
      expect(theme.elevation[0].shadowOpacity).toBe(0);
      expect(theme.elevation[0].elevation).toBe(0);
      for (const level of [1, 2] as const) {
        const next = (level + 1) as 2 | 3;
        expect(theme.elevation[next].shadowRadius).toBeGreaterThan(
          theme.elevation[level].shadowRadius,
        );
        expect(theme.elevation[next].elevation).toBeGreaterThan(theme.elevation[level].elevation);
      }
    });
  });

  it('keeps shadows nearly invisible in dark mode, where depth comes from surface tone', () => {
    for (const level of [1, 2, 3] as const) {
      expect(darkTheme.elevation[level].shadowOpacity).toBeLessThan(
        lightTheme.elevation[level].shadowOpacity,
      );
    }
  });

  describe('typography', () => {
    const type = lightTheme.type;

    it('defines every semantic type token from docs/01 §3', () => {
      expect(Object.keys(type).sort()).toEqual(
        [
          'body',
          'bodyStrong',
          'caption',
          'display',
          'headline',
          'label',
          'stat',
          'timer',
          'title',
        ].sort(),
      );
    });

    it('keeps body text at least 16 and captions at least 12 (docs/11)', () => {
      expect(type.body.fontSize).toBeGreaterThanOrEqual(16);
      for (const token of Object.values(type)) {
        expect(token.fontSize).toBeGreaterThanOrEqual(12);
        expect(token.lineHeight).toBeGreaterThan(token.fontSize);
      }
    });

    it('uses tabular figures for the timer and statistics', () => {
      expect(type.timer.fontVariant).toEqual(['tabular-nums']);
      expect(type.stat.fontVariant).toEqual(['tabular-nums']);
    });

    it('makes the timer the largest text', () => {
      const sizes = Object.values(type).map((token) => token.fontSize);
      expect(type.timer.fontSize).toBe(Math.max(...sizes));
    });
  });

  describe('controls', () => {
    it('keep the documented 52 pt minimum height for primary buttons, above the 44 pt touch minimum', () => {
      expect(lightTheme.control.minHeight).toBe(52);
    });

    it('outline selected chips and input fields with a visible, positive border width', () => {
      expect(lightTheme.control.borderWidth).toBeGreaterThan(0);
    });

    it('size the progress ring so its stroke leaves room inside the circle', () => {
      const { size, strokeWidth } = lightTheme.progressRing;
      expect(size).toBeGreaterThanOrEqual(lightTheme.icon.lg);
      expect(strokeWidth).toBeGreaterThan(0);
      expect(strokeWidth).toBeLessThan(size / 4);
    });

    it('size spot illustrations small, as docs/01 §9 asks, but larger than an icon', () => {
      expect(lightTheme.illustration.spot).toBeGreaterThan(lightTheme.icon.lg);
      expect(lightTheme.illustration.spot).toBeLessThanOrEqual(160);
    });

    it('draw line icons at the documented 1.75–2 stroke (docs/01 §5)', () => {
      expect(lightTheme.lineIcon.strokeWidth).toBeGreaterThanOrEqual(1.75);
      expect(lightTheme.lineIcon.strokeWidth).toBeLessThanOrEqual(2);
    });

    it('size the profile avatar above the touch minimum', () => {
      expect(lightTheme.avatar.lg).toBeGreaterThanOrEqual(44);
    });

    it('press with a slight scale, never a jump', () => {
      expect(lightTheme.interaction.pressedScale).toBeGreaterThanOrEqual(0.95);
      expect(lightTheme.interaction.pressedScale).toBeLessThan(1);
    });
  });

  describe('motion', () => {
    it.each([
      ['fast', 100, 200],
      ['base', 250, 400],
      ['progress', 400, 800],
      ['reward', 800, 1500],
      ['growth', 1000, 2500],
    ] as const)('motion.%s stays within the documented range', (token, min, max) => {
      expect(lightTheme.motion[token]).toBeGreaterThanOrEqual(min);
      expect(lightTheme.motion[token]).toBeLessThanOrEqual(max);
    });

    it('defines the documented easing curves as cubic béziers', () => {
      expect(Object.keys(lightTheme.easing).sort()).toEqual(['enter', 'exit', 'standard']);
      for (const curve of Object.values(lightTheme.easing)) {
        expect(curve).toHaveLength(4);
      }
    });

    it('defines a well-damped gentle spring', () => {
      const { damping, stiffness, mass } = lightTheme.spring.gentle;
      // Damping ratio ζ = c / (2√(km)); near 1 means minimal overshoot.
      expect(damping / (2 * Math.sqrt(stiffness * mass))).toBeGreaterThanOrEqual(0.8);
    });
  });
});
