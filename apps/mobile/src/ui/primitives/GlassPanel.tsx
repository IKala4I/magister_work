/**
 * Frosted panel — File 02 §3.1: glassmorphic depth is reserved for the RECOMMENDATION
 * layer ("what the AI suggests" vs "what you fixed"). Do not use for generic chrome.
 *
 * `solidity` (confidence = solidity) scales the PANEL BACKGROUND only — children (text)
 * always render at full opacity, so copy contrast never drops with model confidence
 * (NFR-A1; the composited-floor test in colors.test.ts proves the worst case).
 *
 * iOS: real blur (expo-blur) under the surface-elevated tint at spec-alpha × solidity.
 * Android and iOS-with-Reduce-Transparency: no blur — the same tint is pre-composited
 * over `surface` into an OPAQUE color, preserving the solidity semantic without alpha.
 */
import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';

import { useTheme } from '../theme';
import { GLASS_BLUR } from '../tokens/colors';
import { blendOverHex, hexWithAlpha } from '../tokens/contrast';
import { radii } from '../tokens/radii';
import { useReduceTransparency } from '../useReduceTransparency';

export interface GlassPanelProps extends PropsWithChildren<ViewProps> {
  radius?: number;
  /** 0..1 multiplier on the panel background alpha (confidence = solidity). Default 1. */
  solidity?: number;
}

export function GlassPanel({
  children,
  radius = radii.card,
  solidity = 1,
  style,
  ...rest
}: GlassPanelProps) {
  const theme = useTheme();
  const reduceTransparency = useReduceTransparency();
  const { color, opacity } = theme.colors.surfaceElevated;
  const effectiveAlpha = opacity * Math.min(1, Math.max(0, solidity));

  if (Platform.OS !== 'ios' || reduceTransparency) {
    return (
      <View
        {...rest}
        style={[
          styles.panel,
          {
            borderRadius: radius,
            backgroundColor: blendOverHex(color, effectiveAlpha, theme.colors.surface),
          },
          style,
        ]}
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
        { borderRadius: radius, backgroundColor: hexWithAlpha(color, effectiveAlpha) },
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
