/**
 * Type tokens — File 02 §3.3. Scale values (size/line-height) byte-exact against the spec:
 * Display 32/38, H1 24/30, H2 20/26, Body 16/24, Caption 13/18.
 *
 * Families are static Inter instances (spec says "Inter Variable"; RN exposes no
 * variable-axis API — spec-conflicts L12) plus JetBrains Mono for numerals/timers.
 * Weight-per-variant is [INFERRED]: the spec fixes sizes only.
 */

export const fontFamilies = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoSemiBold: 'JetBrainsMono_600SemiBold',
} as const;

export interface TypeVariant {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly lineHeight: number;
}

export const typeScale = {
  display: { fontFamily: fontFamilies.bold, fontSize: 32, lineHeight: 38 },
  h1: { fontFamily: fontFamilies.semiBold, fontSize: 24, lineHeight: 30 },
  h2: { fontFamily: fontFamilies.semiBold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fontFamilies.regular, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 18 },
} as const satisfies Record<string, TypeVariant>;

export type TypeVariantName = keyof typeof typeScale;

/**
 * NFR-A2: OS font scaling honored up to 200% without layout breakage. Text primitives cap
 * the multiplier at exactly 2 so the guarantee is testable ("up to 200%").
 */
export const MAX_FONT_SCALE = 2;
