/**
 * rMEQ survey (FR-02): 5 items, every answer individually skippable — a blank item means
 * the survey is not scored (ADR-0005: no prorating rule exists for the instrument) and
 * Hourwell starts neutral (INT, half prior strength). Tapping a selected option clears it.
 */
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { RMEQ_ITEMS } from '../../src/domain/rmeq';
import { t, type MessageKey } from '../../src/i18n';
import { track } from '../../src/observability/analytics';
import { useOnboardingStore } from '../../src/state/onboarding';
import { Button, Screen, ThemedText } from '../../src/ui/primitives';
import { useTheme } from '../../src/ui/theme';

export default function SurveyScreen() {
  const router = useRouter();
  const theme = useTheme();
  const answers = useOnboardingStore((s) => s.answers);
  const setAnswer = useOnboardingStore((s) => s.setAnswer);
  const anySkipped = RMEQ_ITEMS.some((item) => answers[item.id] === null);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ThemedText variant="caption">
          {t('onboarding.step.a11y', { current: 1, total: 4 })}
        </ThemedText>
        <ThemedText variant="h1">{t('onboarding.survey.title')}</ThemedText>
        <ThemedText style={styles.intro}>{t('onboarding.survey.intro')}</ThemedText>

        {RMEQ_ITEMS.map((item) => (
          <View key={item.id} style={styles.item}>
            <ThemedText variant="h2" style={styles.question}>
              {t(`onboarding.rmeq.${item.id}.q` as MessageKey)}
            </ThemedText>
            <View accessibilityRole="radiogroup">
              {item.optionScores.map((_, optionIndex) => {
                const selected = answers[item.id] === optionIndex;
                return (
                  <Pressable
                    key={optionIndex}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setAnswer(item.id, selected ? null : optionIndex)}
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
                    <ThemedText>
                      {t(`onboarding.rmeq.${item.id}.o${optionIndex + 1}` as MessageKey)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {anySkipped ? (
          <ThemedText variant="caption" style={styles.skipNote}>
            {t('onboarding.survey.skipNote')}
          </ThemedText>
        ) : null}

        <Button
          label={t('onboarding.continue')}
          onPress={() => {
            track('onboarding_step_completed', { step: 'survey' });
            router.push('/onboarding/hours');
          }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 12, paddingBottom: 32 },
  intro: { marginBottom: 8 },
  item: { marginTop: 12, gap: 8 },
  question: { marginBottom: 4 },
  option: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 6,
  },
  skipNote: { marginTop: 8, marginBottom: 4 },
});
