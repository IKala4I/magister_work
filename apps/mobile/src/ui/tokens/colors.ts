/**
 * Color tokens — File 02 §3.2, hex values byte-exact against the spec table.
 *
 * `surfaceElevated` is a recipe, not a plain color: the spec defines it as a base hex at an
 * alpha, composited over a blur ("frosted panels at 8–12 px blur used ONLY for the
 * recommendation layer" — File 02 §3.1). Consumers that cannot blur (Android fallback,
 * reduced-transparency) use the same hex fully opaque.
 */

export interface GlassRecipe {
  /** Base hex of the frosted panel. */
  readonly color: string;
  /** Alpha the base is rendered at when blur is available. */
  readonly opacity: number;
}

export interface ColorPalette {
  readonly primary: string;
  readonly primaryContainer: string;
  readonly surface: string;
  readonly surfaceElevated: GlassRecipe;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly energyHigh: string;
  readonly energyLow: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly focusGradient: readonly [string, string];
}

export const lightColors: ColorPalette = {
  primary: '#4F46E5',
  primaryContainer: '#E0E7FF',
  surface: '#FAFAF8',
  surfaceElevated: { color: '#FFFFFF', opacity: 0.92 },
  textPrimary: '#1A1D29',
  textSecondary: '#5B6070',
  energyHigh: '#F59E0B',
  energyLow: '#94A3B8',
  success: '#10B981',
  warning: '#F97316',
  danger: '#EF4444',
  focusGradient: ['#4F46E5', '#7C3AED'],
};

export const darkColors: ColorPalette = {
  primary: '#818CF8',
  primaryContainer: '#312E81',
  surface: '#0F1115',
  surfaceElevated: { color: '#1A1D24', opacity: 0.88 },
  textPrimary: '#EDEEF2',
  textSecondary: '#9AA0AE',
  energyHigh: '#FBBF24',
  energyLow: '#475569',
  success: '#34D399',
  warning: '#FB923C',
  danger: '#F87171',
  focusGradient: ['#4F46E5', '#7C3AED'],
};

/**
 * Frosted-panel blur band (File 02 §3.1: 8–12 px). The default sits mid-band [INFERRED —
 * spec gives the band, not a point value].
 */
export const GLASS_BLUR = { min: 8, max: 12, default: 10 } as const;
