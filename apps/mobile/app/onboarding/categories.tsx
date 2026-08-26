/** Top task categories (FR-02) — multiselect over the fixed File 04 §3.3 taxonomy. */
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { TASK_CATEGORIES } from '../../src/db/schema';
import { t, type MessageKey } from '../../src/i18n';
import { track } from '../../src/observability/analytics';
import { useOnboardingStore } from '../../src/state/onboarding';
import { Button, Screen, ThemedText } from '../../src/ui/primitives';
import { useTheme } from '../../src/ui/theme';

export default function CategoriesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const topCategories = useOnboardingStore((s) => s.topCategories);
  const toggleCategory = useOnboardingStore((s) => s.toggleCategory);

  return (
    <Screen topInset>
      <ThemedText variant="caption">
        {t('onboarding.step.a11y', { current: 3, total: 4 })}
      </ThemedText>
      <ThemedText variant="h1">{t('onboarding.categories.title')}</ThemedText>
      <ThemedText style={styles.intro}>{t('onboarding.categories.intro')}</ThemedText>

      <View style={styles.list}>
        {TASK_CATEGORIES.map((category) => {
          const selected = topCategories.includes(category);
          return (
            <Pressable
              key={category}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              onPress={() => toggleCategory(category)}
              style={[
                styles.option,
                {
                  borderColor: selected ? theme.colors.primary : 'transparent',
                  backgroundColor: selected
                    ? theme.colors.primaryContainer
                    : theme.colors.surfaceElevated.color,
                },
              ]}
            >
              <ThemedText>{t(`task.category.${category}` as MessageKey)}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Button
        label={t('onboarding.continue')}
        onPress={() => {
          track('onboarding_step_completed', { step: 'categories' });
          router.push('/onboarding/seed-tasks');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginTop: 4, marginBottom: 16 },
  list: { flex: 1, gap: 8 },
  option: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
});
