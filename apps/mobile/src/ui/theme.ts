/**
 * Theme resolution: OS scheme (useColorScheme) overridden by the user's appearance
 * preference, mapped onto the File 02 §3 token set. Pure resolver split out for tests.
 */
import { useColorScheme } from 'react-native';

import { useAppearanceStore, type SchemePreference } from '../state/appearance';
import { lightColors, darkColors, type ColorPalette } from './tokens/colors';
import { typeScale, fontFamilies } from './tokens/typography';
import { radii } from './tokens/radii';

export type ResolvedScheme = 'light' | 'dark';

export interface Theme {
  readonly scheme: ResolvedScheme;
  readonly colors: ColorPalette;
  readonly typeScale: typeof typeScale;
  readonly fontFamilies: typeof fontFamilies;
  readonly radii: typeof radii;
}

export function resolveScheme(
  preference: SchemePreference,
  osScheme: ResolvedScheme | null | undefined,
): ResolvedScheme {
  if (preference === 'system') return osScheme ?? 'light';
  return preference;
}

const themes: Record<ResolvedScheme, Theme> = {
  light: { scheme: 'light', colors: lightColors, typeScale, fontFamilies, radii },
  dark: { scheme: 'dark', colors: darkColors, typeScale, fontFamilies, radii },
};

export function useTheme(): Theme {
  const osScheme = useColorScheme();
  const preference = useAppearanceStore((s) => s.preference);
  // RN may report 'unspecified'/null before the first trait collection — treat as unknown.
  const os = osScheme === 'light' || osScheme === 'dark' ? osScheme : null;
  return themes[resolveScheme(preference, os)];
}
