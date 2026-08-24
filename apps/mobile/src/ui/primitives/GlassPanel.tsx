/**
 * Frosted panel — File 02 §3.1: glassmorphic depth is reserved for the RECOMMENDATION
 * layer ("what the AI suggests" vs "what you fixed"). Do not use for generic chrome.
 *
 * iOS: real blur (expo-blur) under the surface-elevated tint at its spec alpha.
 * Android: expo-blur's experimental blur is inconsistent, so it falls back to the same
 * hex fully opaque — the palette defines exactly this fallback.
 */
import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';

import { useTheme } from '../theme';
import { GLASS_BLUR } from '../tokens/colors';
import { radii } from '../tokens/radii';

function hexWithAlpha(hex: string, alpha: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex}${byte.toString(16).padStart(2, '0')}`;
}

export interface GlassPanelProps extends PropsWithChildren<ViewProps> {
  radius?: number;
}

export function GlassPanel({ children, radius = radii.card, style, ...rest }: GlassPanelProps) {
  const theme = useTheme();
  const { color, opacity } = theme.colors.surfaceElevated;

  if (Platform.OS !== 'ios') {
    return (
      <View
        {...rest}
        style={[styles.panel, { borderRadius: radius, backgroundColor: color }, style]}
      >
        {children}
      </View>
    );
  }

  // [INFERRED] expo-blur exposes a 0–100 intensity, not a px radius; 5×px maps the spec's
  // 8–12 px band onto 40–60, centering on the platform-default "regular" material feel.
  return (
    <BlurView
      intensity={GLASS_BLUR.default * 5}
      tint={theme.scheme === 'dark' ? 'dark' : 'light'}
      {...rest}
      style={[
        styles.panel,
        { borderRadius: radius, backgroundColor: hexWithAlpha(color, opacity) },
        style,
      ]}
    >
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  panel: { overflow: 'hidden', padding: 16 },
});
