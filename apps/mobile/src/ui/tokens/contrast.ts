/**
 * WCAG 2.2 contrast math (NFR-A1). Used by token tests to prove the File 02 §3.2 claim
 * "all pairings meet WCAG 2.2 AA (≥4.5:1 body text)", and later by the heatmap's
 * accessible-alternative path (FR-40).
 */

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || m[1] === undefined) {
    throw new RangeError(`expected #RRGGBB hex color, got ${hex}`);
  }
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** WCAG relative luminance of an sRGB hex color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors, ≥1. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const WCAG_AA_BODY = 4.5;
export const WCAG_AA_LARGE = 3;
