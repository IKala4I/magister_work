/** OKLCH conversions round-trip and the energy ramp is perceptually monotone (FR-40, P9). */
import { lightColors, darkColors } from '../colors';
import { hexToOklab, hexToOklch, interpolateOklch, oklabToHex, oklchToHex } from '../oklch';

describe('OKLab / OKLCH conversions (Ottosson)', () => {
  it('round-trips the token colours within 1/255 per channel', () => {
    for (const hex of [
      lightColors.energyLow,
      lightColors.energyHigh,
      darkColors.energyLow,
      darkColors.energyHigh,
      lightColors.primary,
      '#000000',
      '#ffffff',
    ]) {
      const [l, a, b] = hexToOklab(hex);
      expect(oklabToHex(l, a, b).toLowerCase()).toBe(hex.toLowerCase());
      expect(oklchToHex(hexToOklch(hex)).toLowerCase()).toBe(hex.toLowerCase());
    }
  });
  it('reference values: white is L≈1, black is L=0, pure red hue ≈ 29°', () => {
    expect(hexToOklch('#ffffff').l).toBeCloseTo(1, 2);
    expect(hexToOklch('#000000').l).toBeCloseTo(0, 6);
    expect(hexToOklch('#ff0000').h).toBeCloseTo(29.2, 0);
  });
});

describe('interpolateOklch', () => {
  it('returns the endpoints exactly at t = 0 / 1 and clamps outside [0,1]', () => {
    const lo = lightColors.energyLow;
    const hi = lightColors.energyHigh;
    expect(interpolateOklch(lo, hi, 0).toLowerCase()).toBe(lo.toLowerCase());
    expect(interpolateOklch(lo, hi, 1).toLowerCase()).toBe(hi.toLowerCase());
    expect(interpolateOklch(lo, hi, -2)).toBe(interpolateOklch(lo, hi, 0));
    expect(interpolateOklch(lo, hi, 7)).toBe(interpolateOklch(lo, hi, 1));
    expect(interpolateOklch(lo, hi, Number.NaN)).toBe(interpolateOklch(lo, hi, 0));
  });
  it('lightness and chroma move monotonically along the ramp (no muddy midpoint)', () => {
    for (const palette of [lightColors, darkColors]) {
      const steps = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) =>
        hexToOklch(interpolateOklch(palette.energyLow, palette.energyHigh, t)),
      );
      const a = hexToOklch(palette.energyLow);
      const b = hexToOklch(palette.energyHigh);
      const sign = Math.sign(b.l - a.l);
      for (let i = 1; i < steps.length; i++) {
        expect(Math.sign(steps[i]!.l - steps[i - 1]!.l + 1e-9 * sign)).toBe(sign);
        expect(steps[i]!.c).toBeGreaterThanOrEqual(Math.min(a.c, b.c) - 0.01);
        expect(steps[i]!.c).toBeLessThanOrEqual(Math.max(a.c, b.c) + 0.01);
      }
    }
  });
  it('a near-grey endpoint adopts the other hue instead of spinning through the wheel', () => {
    const mid = hexToOklch(interpolateOklch('#808080', '#f59e0b', 0.5));
    expect(Math.abs(mid.h - hexToOklch('#f59e0b').h)).toBeLessThan(1);
  });
});
