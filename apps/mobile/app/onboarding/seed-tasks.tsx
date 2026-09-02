/**
 * Seed tasks (UC-01 "3 seed tasks prompted") — the P3 quick-add, so the NL grammar and
 * ambiguity chips behave exactly like the Inbox. Completion persists the profile; the
 * server instantiates cold-start priors from it (the first plan itself arrives with P6).
 */
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { completeOnboardingAction } from '../../src/domain/onboarding';
import { createTaskAction } from '../../src/domain/taskActions';
import { t } from '../../src/i18n';
import { track } from '../../src/observability/analytics';
import { useOnboardingStore } from '../../src/state/onboarding';
import { QuickAddBar } from '../../src/ui/task/QuickAddBar';
import { Button, Screen, ThemedText } from '../../src/ui/primitives';

const SEED_TASK_TARGET = 3;

export default function SeedTasksScreen() {
  const router = useRouter();
  const seedTasksAdded = useOnboardingStore((s) => s.seedTasksAdded);
  const countSeedTask = useOnboardingStore((s) => s.countSeedTask);

  const finish = () => {
    const state = useOnboardingStore.getState();
    track('onboarding_step_completed', { step: 'seed_tasks' });
    completeOnboardingAction({
      answers: state.answers,
      workingHours: state.workingHours,
      sleepWindow: state.sleepWindow,
      topCategories: state.topCategories,
      seedTasksAdded: state.seedTasksAdded,
    });
    state.reset();
    router.replace('/(tabs)');
  };

  return (
    <Screen topInset>
      {/* Keep the primary CTA reachable while the quick-add keyboard is up (P4 Maestro
          walk caught it buried behind the keyboard — keyboard stays open for consecutive
          adds by design, so the footer must float above it). */}
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ThemedText variant="caption">
          {t('onboarding.step.a11y', { current: 4, total: 4 })}
        </ThemedText>
        <ThemedText variant="h1">{t('onboarding.seedTasks.title')}</ThemedText>
        <ThemedText style={styles.intro}>{t('onboarding.seedTasks.intro')}</ThemedText>

        {/* the intro above already teaches the NL example — no second caption (review F4) */}
        <QuickAddBar
          showExample={false}
          onSubmit={(draft, nlParseUsed) => {
            createTaskAction(draft, { source: 'quick_add', nlParseUsed });
            countSeedTask();
          }}
        />
        <View style={styles.counter}>
          <ThemedText variant="caption">
            {t('onboarding.seedTasks.added', { count: Math.min(seedTasksAdded, SEED_TASK_TARGET) })}
          </ThemedText>
        </View>

        <View style={styles.footer}>
          <Button
            label={seedTasksAdded > 0 ? t('onboarding.seedTasks.finish') : t('onboarding.skipStep')}
            onPress={finish}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avoider: { flex: 1 },
  intro: { marginTop: 4, marginBottom: 12 },
  counter: { marginTop: 8 },
  footer: { flex: 1, justifyContent: 'flex-end', paddingBottom: 8 },
});
