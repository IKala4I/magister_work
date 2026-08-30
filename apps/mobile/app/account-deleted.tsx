/**
 * FR-42 / UC-10 confirmation (ADR-0014 §9): the server erased the account; this install has
 * already forgotten everything. Shows the proof-of-erasure reference and the completion time,
 * then offers a fresh start (onboarding as a new anonymous trial).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { t } from '../src/i18n';
import { Button, Screen, ThemedText } from '../src/ui/primitives';

export default function AccountDeletedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reference?: string; at?: string }>();
  const reference = typeof params.reference === 'string' ? params.reference : '';
  const at = typeof params.at === 'string' ? Date.parse(params.at) : NaN;
  const when = Number.isNaN(at)
    ? ''
    : new Date(at).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
  return (
    <Screen>
      <View style={styles.body} accessibilityRole="summary">
        <ThemedText variant="h1">{t('accountDeleted.title')}</ThemedText>
        <ThemedText>{t('accountDeleted.body', { when })}</ThemedText>
        {reference ? (
          <ThemedText mono accessibilityLabel={t('accountDeleted.reference', { reference })}>
            {t('accountDeleted.reference', { reference })}
          </ThemedText>
        ) : null}
        <ThemedText variant="caption" tone="secondary">
          {t('accountDeleted.referenceHint')}
        </ThemedText>
        <Button
          label={t('accountDeleted.startOver')}
          onPress={() => router.replace('/onboarding')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingTop: 24 },
});
