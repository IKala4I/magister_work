/**
 * File 02 §3.3 type scale — sizes/line-heights are spec-fixed; families must reference
 * loaded font instances (Inter statics per spec-conflicts L12, JetBrains Mono for numerals).
 */
import { typeScale, fontFamilies, MAX_FONT_SCALE } from '../typography';

describe('File 02 §3.3 type scale', () => {
  it.each([
    ['display', 32, 38],
    ['h1', 24, 30],
    ['h2', 20, 26],
    ['body', 16, 24],
    ['caption', 13, 18],
  ] as const)('%s is %i/%i', (variant, size, lineHeight) => {
    expect(typeScale[variant].fontSize).toBe(size);
    expect(typeScale[variant].lineHeight).toBe(lineHeight);
  });

  it('every variant uses an Inter instance (UI & headings per spec)', () => {
    for (const variant of Object.values(typeScale)) {
      expect(variant.fontFamily).toMatch(/^Inter_/);
    }
  });

  it('exposes JetBrains Mono for numerals & timers', () => {
    expect(fontFamilies.mono).toMatch(/^JetBrainsMono_/);
    expect(fontFamilies.monoSemiBold).toMatch(/^JetBrainsMono_/);
  });

  it('caps font scaling at exactly 200% (NFR-A2)', () => {
    expect(MAX_FONT_SCALE).toBe(2);
  });
});
