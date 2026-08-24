/**
 * File 02 §3.2 palette — snapshot pins every hex byte-exactly; contrast tests prove the
 * spec's own claim that pairings meet WCAG 2.2 AA (NFR-A1).
 */
import { lightColors, darkColors, GLASS_BLUR } from '../colors';
import { blendOverHex, contrastRatio, WCAG_AA_BODY, WCAG_AA_LARGE } from '../contrast';
import { CONFIDENCE_OPACITY_MIN } from '../confidence';

describe('File 02 §3.2 color palette', () => {
  it('matches the spec table exactly (snapshot)', () => {
    expect({ light: lightColors, dark: darkColors }).toMatchSnapshot();
  });

  it.each([
    ['light text-primary on surface', lightColors.textPrimary, lightColors.surface],
    ['light text-secondary on surface', lightColors.textSecondary, lightColors.surface],
    [
      'light text-primary on glass base',
      lightColors.textPrimary,
      lightColors.surfaceElevated.color,
    ],
    [
      'light text-secondary on glass base',
      lightColors.textSecondary,
      lightColors.surfaceElevated.color,
    ],
    ['dark text-primary on surface', darkColors.textPrimary, darkColors.surface],
    ['dark text-secondary on surface', darkColors.textSecondary, darkColors.surface],
    ['dark text-primary on glass base', darkColors.textPrimary, darkColors.surfaceElevated.color],
    [
      'dark text-secondary on glass base',
      darkColors.textSecondary,
      darkColors.surfaceElevated.color,
    ],
  ])('%s meets AA body text (≥4.5:1)', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(WCAG_AA_BODY);
  });

  it.each([
    ['light primary on surface', lightColors.primary, lightColors.surface],
    ['dark primary on surface', darkColors.primary, darkColors.surface],
  ])('%s meets AA for large text / UI components (≥3:1)', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
  });

  it.each([
    [
      'light text-primary on primary-container',
      lightColors.textPrimary,
      lightColors.primaryContainer,
    ],
    ['dark text-primary on primary-container', darkColors.textPrimary, darkColors.primaryContainer],
  ])('%s meets AA body text (≥4.5:1)', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(WCAG_AA_BODY);
  });

  // Worst case of confidence = solidity: an exploration block at the opacity floor. The
  // panel tint is composited over the surface at spec-alpha × floor; copy stays full
  // opacity (GlassPanel contract), so THIS is the real background text sits on.
  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)(
    '%s glass at the confidence floor keeps both text tones AA (NFR-A1)',
    (_scheme, c) => {
      const flooredPanel = blendOverHex(
        c.surfaceElevated.color,
        c.surfaceElevated.opacity * CONFIDENCE_OPACITY_MIN,
        c.surface,
      );
      expect(contrastRatio(c.textPrimary, flooredPanel)).toBeGreaterThanOrEqual(WCAG_AA_BODY);
      expect(contrastRatio(c.textSecondary, flooredPanel)).toBeGreaterThanOrEqual(WCAG_AA_BODY);
    },
  );

  it('keeps the glass blur inside the File 02 §3.1 band (8–12 px)', () => {
    expect(GLASS_BLUR.default).toBeGreaterThanOrEqual(GLASS_BLUR.min);
    expect(GLASS_BLUR.default).toBeLessThanOrEqual(GLASS_BLUR.max);
    expect(GLASS_BLUR.min).toBe(8);
    expect(GLASS_BLUR.max).toBe(12);
  });

  it('uses the same focus gradient in both modes (spec: "same")', () => {
    expect(darkColors.focusGradient).toEqual(lightColors.focusGradient);
  });
});
