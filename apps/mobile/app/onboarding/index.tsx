/** Welcome (UC-01 main flow entry; FR-01 sign-in path for returning users). */
import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { isAuthAvailable } from '../../src/auth/client';
import { useOnboardingComplete } from '../../src/db/useProfile';
import { t } from '../../src/i18n';
import { track } from '../../src/observability/analytics';
import { Button, Screen, ThemedText } from '../../src/ui/primitives';

export default function WelcomeScreen() {
  const router = useRouter();
  // Symmetric gate (finding m1): the tabs gate flips false for an instant when the session
  // uid changes before the deferred adopt/rehydrate lands; once the profile (re)appears,
  // this sends the user straight back instead of stranding them on onboarding.
  const onboarded = useOnboardingComplete();
  if (onboarded) return <Redirect href="/(tabs)" />;
  return (
    <Screen topInset>
      <View style={styles.hero}>
        <ThemedText variant="display">{t('app.name')}</ThemedText>
        <ThemedText variant="h2" style={styles.tagline}>
          {t('onboarding.welcome.title')}
        </ThemedText>
        <ThemedText style={styles.body}>{t('onboarding.welcome.body')}</ThemedText>
      </View>
      <Button
        label={t('onboarding.welcome.start')}
        onPress={() => {
          track('onboarding_step_completed', { step: 'welcome' });
          router.push('/onboarding/survey');
        }}
      />
      {isAuthAvailable() ? (
        <Button
          kind="secondary"
          label={t('onboarding.welcome.signIn')}
          onPress={() => router.push('/auth/sign-in')}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, justifyContent: 'center', gap: 16 },
  tagline: { marginTop: 4 },
  body: { marginTop: 4 },
});
