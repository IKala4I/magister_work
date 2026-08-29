/**
 * OKLCH interpolation for the energy heatmap (FR-40, P9). Interpolating in a perceptual space
 * keeps the low → high ramp visually even and dodges the muddy midpoint an sRGB lerp produces
 * between the spec's amber `energyHigh` and slate `energyLow` (File 02 §3.2). Conversions are
 * Björn Ottosson's OKLab (2020) — the same math CSS `oklch()` uses — so a designer can reproduce
 * any cell colour from the token pair. Pure functions, no dependency.
 */
import { hexToRgb } from './contrast';

export interface Oklch {
  /** Lightness 0..1 */
  l: number;
  /** Chroma ≥ 0 */
  c: number;
  /** Hue in degrees [0, 360) */
  h: number;
}

const srgbToLinear = (v: number): number =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const linearToSrgb = (v: number): number =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** sRGB hex → OKLab (Ottosson: linear sRGB → LMS → cube root → Lab). */
export function hexToOklab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => srgbToLinear(v / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToHex(L: number, a: number, b: number): string {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.round(clamp01(linearToSrgb(clamp01(v))) * 255));
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToOklch(hex: string): Oklch {
  const [l, a, b] = hexToOklab(hex);
  const c = Math.hypot(a, b);
  const h = c < 1e-6 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { l, c, h };
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const rad = (h * Math.PI) / 180;
  return oklabToHex(l, c * Math.cos(rad), c * Math.sin(rad));
}

/**
 * Interpolate two hex colours in OKLCH at t ∈ [0,1] (clamped). Hue takes the shorter arc; a
 * near-achromatic endpoint adopts the other's hue so grey → amber does not spin through the
 * wheel.
 */
export function interpolateOklch(fromHex: string, toHex: string, t: number): string {
  const k = Number.isFinite(t) ? clamp01(t) : 0;
  const a = hexToOklch(fromHex);
  const b = hexToOklch(toHex);
  const ha = a.c < 0.02 ? b.h : a.h;
  const hb = b.c < 0.02 ? a.h : b.h;
  let dh = hb - ha;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return oklchToHex({
    l: a.l + (b.l - a.l) * k,
    c: a.c + (b.c - a.c) * k,
    h: (ha + dh * k + 360) % 360,
  });
}
