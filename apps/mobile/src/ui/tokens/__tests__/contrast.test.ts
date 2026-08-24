/**
 * WCAG 2.2 contrast math checked against the W3C worked values: black/white = 21:1,
 * identical colors = 1:1, and the published luminance of pure red.
 */
import { hexToRgb, relativeLuminance, contrastRatio } from '../contrast';

describe('WCAG contrast math', () => {
  it('parses hex', () => {
    expect(hexToRgb('#FF8000')).toEqual([255, 128, 0]);
    expect(() => hexToRgb('#FFF')).toThrow(RangeError);
    expect(() => hexToRgb('4F46E5')).toThrow(RangeError);
  });

  it('reproduces the canonical luminances', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 10);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 10);
    expect(relativeLuminance('#FF0000')).toBeCloseTo(0.2126, 4);
  });

  it('black on white is 21:1 and symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });

  it('identical colors are 1:1', () => {
    expect(contrastRatio('#4F46E5', '#4F46E5')).toBeCloseTo(1, 10);
  });
});
