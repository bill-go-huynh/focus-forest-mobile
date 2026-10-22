import { clusterOutline, volume } from '../signature/brush';
import { LIGHTING_PRESETS, SIGNATURE_PALETTE, TIMES_OF_DAY } from '../signature/palette';
import { SPECIES_KEYS, speciesDefinition } from '../species';

/**
 * ART.1 Direction B, painterly-flat (owner decision 2026-10-16; docs/01 §6, docs/10 §1):
 * clusters get organic outlines and a volume gradient lit from the upper left. The outline is
 * drawn inside the authored ellipse, so a tree never outgrows its stage's bounds (docs/03 §3).
 */

const numbers = (path: string) => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

function points(path: string) {
  const values = numbers(path);
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < values.length; i += 2) result.push({ x: values[i]!, y: values[i + 1]! });
  return result;
}

function hsl(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const lightness = (max + min) / 2;
  if (d === 0) return { hue: 0, saturation: 0 };
  const saturation = d / (1 - Math.abs(2 * lightness - 1));
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue *= 60;
  return { hue: hue < 0 ? hue + 360 : hue, saturation };
}

describe('cluster outlines (ART.1)', () => {
  const shape = { cx: 120, cy: 112, rx: 28, ry: 21, rotation: 0 };

  it('is a closed organic path, the same for the same cluster', () => {
    const outline = clusterOutline(shape, 'main-core-3');
    expect(outline).toMatch(/^M[\d.\s-]+( Q[\d.\s-]+)+Z$/);
    expect(clusterOutline(shape, 'main-core-3')).toBe(outline);
    expect(clusterOutline(shape, 'main-core-4')).not.toBe(outline);
  });

  it.each([0, -30, 25])('stays inside the authored ellipse (rotation %s)', (rotation) => {
    for (const key of ['back-core-0', 'main-extra-5', 'front-core-1', 'richness-2']) {
      const s = { ...shape, rotation };
      const t = (-rotation * Math.PI) / 180;
      for (const p of points(clusterOutline(s, key))) {
        const dx = p.x - s.cx;
        const dy = p.y - s.cy;
        const x = dx * Math.cos(t) - dy * Math.sin(t);
        const y = dx * Math.sin(t) + dy * Math.cos(t);
        expect((x / s.rx) ** 2 + (y / s.ry) ** 2).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('fills most of its ellipse, so fullness still reads (docs/03 §4 legibility)', () => {
    const extents = points(clusterOutline(shape, 'main-core-0')).map((p) =>
      Math.hypot((p.x - shape.cx) / shape.rx, (p.y - shape.cy) / shape.ry),
    );
    expect(Math.min(...extents)).toBeGreaterThan(0.8);
  });

  it('never uses Math.random', () => {
    const random = jest.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not decide how a tree looks.');
    });
    try {
      clusterOutline(shape, 'main-core-1');
    } finally {
      random.mockRestore();
    }
  });
});

describe('volume (ART.1)', () => {
  it('lights the upper left and shades the lower right of a color', () => {
    const v = volume('#6FA463');
    const sum = (hex: string) =>
      [1, 3, 5].reduce((t, i) => t + parseInt(hex.slice(i, i + 2), 16), 0);
    expect(sum(v.light)).toBeGreaterThan(sum('#6FA463'));
    expect(sum(v.dark)).toBeLessThan(sum('#6FA463'));
  });

  it('keeps every species’ foliage alive in every light, lit or shaded (docs/03 §6)', () => {
    for (const key of SPECIES_KEYS) {
      for (const tint of speciesDefinition(key).palette.tints) {
        for (const leaf of [tint.back, tint.main, tint.front]) {
          for (const stop of [volume(leaf).light, volume(leaf).dark]) {
            const { hue, saturation } = hsl(stop);
            expect(hue).toBeGreaterThanOrEqual(70);
            expect(hue).toBeLessThanOrEqual(185);
            expect(saturation).toBeGreaterThan(0.15);
          }
        }
      }
    }
  });
});

describe('scene palette (ART.1, the canvas’ lighting presets)', () => {
  it.each(TIMES_OF_DAY)('%s has a light pool and a horizon mist', (timeOfDay) => {
    const { pool, mist } = LIGHTING_PRESETS[timeOfDay];
    for (const color of [pool.color, mist.color]) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(pool.opacity).toBeGreaterThan(0);
    expect(pool.opacity).toBeLessThanOrEqual(0.75);
    expect(mist.opacity).toBeGreaterThan(0);
    expect(mist.opacity).toBeLessThanOrEqual(0.6);
  });

  it('keeps night a deep blue-green, never black (docs/01 §10)', () => {
    const [top] = LIGHTING_PRESETS.night.sky;
    expect(top).not.toBe('#000000');
    const { hue } = hsl(top);
    expect(hue).toBeGreaterThanOrEqual(160);
    expect(hue).toBeLessThanOrEqual(220);
  });

  it('keeps the grain faint', () => {
    expect(SIGNATURE_PALETTE.opacity.grain).toBeGreaterThan(0);
    expect(SIGNATURE_PALETTE.opacity.grain).toBeLessThanOrEqual(0.6);
  });
});

describe('depth through value (ART.5, docs/03 §7)', () => {
  const lightness = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
      number,
      number,
      number,
    ];
    return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  };

  it.each(SPECIES_KEYS)('%s: back foliage is lighter than main, front deeper', (key) => {
    for (const tint of speciesDefinition(key).palette.tints) {
      expect(lightness(tint.back)).toBeGreaterThan(lightness(tint.main) - 0.02);
      expect(lightness(tint.front)).toBeLessThan(lightness(tint.main));
    }
  });
});
