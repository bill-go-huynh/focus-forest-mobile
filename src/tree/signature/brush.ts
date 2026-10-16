import { SIGNATURE_PALETTE } from './palette';

/**
 * How the renderer paints (ART.1, owner decision 2026-10-16: direction B, painterly-flat;
 * docs/01 §6, docs/10 §1). Clusters keep their authored ellipse (the slot, which composition
 * owns) and are drawn as an organic outline inside it, lit from the upper left. Pure and
 * deterministic: the outline depends only on the cluster's ellipse and key, never on
 * Math.random, so a tree looks the same on every render and every device.
 */

interface Oval {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation?: number;
}

/** How far the outline may come in from the ellipse: 0 is the ellipse itself. */
const DEPTH = 0.16;
const POINTS = 40;

/** FNV-1a: a stable number for a cluster key. */
function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const fixed = (n: number) => Number(n.toFixed(1));

/**
 * A leaf cluster's outline: a soft, irregular closed path that never leaves its ellipse, so the
 * tree stays inside its stage's bounds and fullness reads as before (docs/03 §3–4).
 */
export function clusterOutline(shape: Oval, key: string): string {
  const h = hash(key);
  const phase = [(h % 997) / 158.7, ((h >>> 10) % 991) / 157.7, ((h >>> 20) % 983) / 156.4];
  const turn = ((shape.rotation ?? 0) * Math.PI) / 180;
  const points: [number, number][] = [];
  for (let i = 0; i < POINTS; i += 1) {
    const a = (i / POINTS) * Math.PI * 2;
    // Four ripples of falling size, from -1 to 1: lobes, smaller lobes, then a leafy edge.
    const ripple =
      0.4 * Math.sin(3 * a + phase[0]!) +
      0.22 * Math.sin(5 * a + phase[1]!) +
      0.22 * Math.sin(11 * a + phase[2]!) +
      0.16 * Math.sin(19 * a + phase[0]! + phase[2]!);
    // 0.99 keeps rounding to one decimal inside the ellipse too.
    const reach = 0.99 - DEPTH * (0.5 + 0.5 * ripple);
    const x = shape.rx * reach * Math.cos(a);
    const y = shape.ry * reach * Math.sin(a);
    points.push([
      shape.cx + x * Math.cos(turn) - y * Math.sin(turn),
      shape.cy + x * Math.sin(turn) + y * Math.cos(turn),
    ]);
  }
  // Quadratic curves through the midpoints stay inside the points' hull, so inside the ellipse.
  const mid = (a: [number, number], b: [number, number]) =>
    `${fixed((a[0] + b[0]) / 2)} ${fixed((a[1] + b[1]) / 2)}`;
  let d = `M${mid(points[POINTS - 1]!, points[0]!)}`;
  for (let i = 0; i < POINTS; i += 1) {
    const p = points[i]!;
    d += ` Q${fixed(p[0])} ${fixed(p[1])} ${mid(p, points[(i + 1) % POINTS]!)}`;
  }
  return `${d}Z`;
}

type Hsl = [number, number, number];

function toHsl(hex: string): Hsl {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Hsl;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, s, l];
}

function toHex([h, s, l]: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b]
    .map((v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Moves a color's lightness and hue, keeping its saturation (so a leaf never greys out). */
function shift(color: string, by: { lightness: number; hue: number }): string {
  const [h, s, l] = toHsl(color);
  return toHex([(h + by.hue + 360) % 360, s, clamp(l + by.lightness, 0.04, 0.92)]);
}

/**
 * A color's lit and shaded ends: the key light comes from the upper left (docs/10 §3). The lit
 * end is lighter and a little warmer, the shaded end darker and a little cooler; saturation
 * stays, so foliage stays alive in both (docs/03 §6).
 */
export function volume(color: string): { light: string; dark: string } {
  const v = SIGNATURE_PALETTE.volume;
  return { light: shift(color, v.light), dark: shift(color, v.dark) };
}

/** Where a cluster's light falls, as a radial gradient in the cluster's own box. */
export const KEY_LIGHT = { cx: '30%', cy: '24%', r: '86%' } as const;

/** Bark's lit and shaded sides. */
export function barkVolume(color: string): { light: string; dark: string } {
  const v = SIGNATURE_PALETTE.barkVolume;
  return { light: shift(color, v.light), dark: shift(color, v.dark) };
}
