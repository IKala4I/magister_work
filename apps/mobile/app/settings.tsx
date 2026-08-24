/**
 * Settings (modal). P2 ships the appearance preference; account, working hours, and
 * notification controls land with their phases (P4/P10).
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { t, type MessageKey } from '../src/i18n';
import {
  SCHEME_PREFERENCES,
  useAppearanceStore,
  type SchemePreference,
} from '../src/state/appearance';
import { Screen, ThemedText } from '../src/ui/primitives';
import { useTheme } from '../src/ui/theme';

const PREFERENCE_LABELS: Record<SchemePreference, MessageKey> = {
  system: 'settings.appearance.system',
  light: 'settings.appearance.light',
  dark: 'settings.appearance.dark',
};

export default function SettingsScreen() {
  const theme = useTheme();
  const preference = useAppearanceStore((s) => s.preference);
  const setPreference = useAppearanceStore((s) => s.setPreference);

  return (
    <Screen>
      <ThemedText variant="h2" style={styles.sectionTitle}>
        {t('settings.appearance.title')}
      </ThemedText>
      <View accessibilityRole="radiogroup">
        {SCHEME_PREFERENCES.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: option === preference }}
            accessibilityLabel={t(PREFERENCE_LABELS[option])}
            onPress={() => setPreference(option)}
            style={styles.row}
          >
            <ThemedText>{t(PREFERENCE_LABELS[option])}</ThemedText>
            {option === preference ? (
              <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
            ) : null}
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { marginTop: 8, marginBottom: 12 },
  // ≥44 px touch target (NFR-A1)
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
