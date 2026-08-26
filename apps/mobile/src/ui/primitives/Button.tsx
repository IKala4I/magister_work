/**
 * Buttons for flows (P4 onboarding/auth). Primary = filled; secondary = quiet text
 * action (skip/sign-in links — File 02 §3: skip is never red, no guilt UI). ≥44 px
 * touch targets (NFR-A1); disabled state announced via accessibilityState.
 */
import { Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '../theme';

import { ThemedText } from './ThemedText';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, kind = 'primary', disabled = false, style }: ButtonProps) {
  const theme = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary && { backgroundColor: theme.colors.primary },
        (pressed || disabled) && styles.dimmed,
        style,
      ]}
    >
      <ThemedText
        variant="body"
        // White on primary in BOTH schemes — the token set has no on-primary color yet
        // (File 02 §3.2 defines none); indigo-600 passes AA against white (contrast tests).
        style={[styles.label, { color: primary ? '#FFFFFF' : theme.colors.primary }]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  dimmed: { opacity: 0.55 },
  label: { textAlign: 'center' },
});
