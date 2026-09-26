/** WCAG 2.x contrast ratio between two opaque hex colors (#RRGGBB). */
export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
  if (/^#[0-9A-Fa-f]{8}$/.test(hex)) {
    throw new Error(`Contrast needs an opaque color; ${hex} has an alpha channel.`);
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    throw new Error(`Expected a #RRGGBB color, got ${hex}.`);
  }
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
