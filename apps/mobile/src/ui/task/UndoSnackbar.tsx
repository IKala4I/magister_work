/**
 * Undo bar for destructive actions — File 02 §3: destructive actions are undoable for
 * 6 seconds. Timing is owned by the screen (one timer per deleted row, so consecutive
 * deletes never shorten each other's window); the bar just renders what is currently
 * undoable. No animation (nothing may depend on one completing, NFR-A2).
 */
import { useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';

import { t } from '../../i18n';
import { ThemedText } from '../primitives';
import { useTheme } from '../theme';

export const UNDO_WINDOW_MS = 6000;

export interface UndoSnackbarProps {
  message: string;
  onUndo: () => void;
}

export function UndoSnackbar({ message, onUndo }: UndoSnackbarProps) {
  const theme = useTheme();

  // accessibilityLiveRegion is Android-only; without an explicit announcement a VoiceOver
  // user gets 6 s to discover an unannounced control.
  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.bar,
        { backgroundColor: theme.colors.surfaceElevated.color, borderRadius: theme.radii.card },
      ]}
    >
      <ThemedText variant="caption" style={styles.message} numberOfLines={1}>
        {message}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('inbox.undo.action')}
        onPress={onUndo}
        style={styles.action}
      >
        <ThemedText variant="caption" style={{ color: theme.colors.primary }}>
          {t('inbox.undo.action')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 4,
    minHeight: 48,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  message: { flex: 1 },
  action: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
});
