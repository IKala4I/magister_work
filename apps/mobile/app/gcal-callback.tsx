/**
 * Deep-link landing for the Google Calendar consent round trip (hourwell://gcal-callback?status=…,
 * ADR-0012 §10). The edge function already exchanged the code and stored the refresh token
 * server-side; the device only learns the outcome and pulls the imported meetings. Cold and
 * warm starts both land here; the settings screen is one tap away either way.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '../src/i18n';
import { syncNow } from '../src/sync/engine';
import { Button, Screen, ThemedText } from '../src/ui/primitives';

export default function GcalCallbackScreen() {
  const router = useRouter();
  const { status } = useLocalSearchParams<{ status?: string }>();
  const ok = status === 'ok';

  useEffect(() => {
    if (ok) void syncNow('manual');
  }, [ok]);

  return (
    <Screen topInset>
      <View style={styles.centered}>
        <ThemedText style={styles.spaced}>
          {ok ? t('gcal.callback.ok') : t('gcal.callback.failed')}
        </ThemedText>
        <Button
          label={t('gcal.callback.back')}
          onPress={() => router.replace('/settings')}
          style={styles.spaced}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  spaced: { marginTop: 12 },
});
