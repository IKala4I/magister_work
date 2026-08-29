/**
 * Deep-link landing for the Google Calendar consent round trip
 * (hourwell://gcal-callback?status=ok&confirm=…, ADR-0012 §10). The edge function exchanged the
 * code and stored the refresh token server-side UNCONFIRMED; this device — the one that started
 * the consent — activates it with the one-shot confirm token under its own session (a consent
 * that landed on another person's phone is refused there and purged). Cold and warm starts
 * both land here; the in-app flow (src/sync/gcal.ts) confirms itself when the browser session
 * returns, so a second confirm from this route finds the token already consumed — harmless.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '../src/i18n';
import { gcalConfirm } from '../src/sync/gcal';
import { Button, Screen, ThemedText } from '../src/ui/primitives';

export default function GcalCallbackScreen() {
  const router = useRouter();
  const { status, confirm } = useLocalSearchParams<{ status?: string; confirm?: string }>();
  const [outcome, setOutcome] = useState<'working' | 'ok' | 'failed'>(
    status === 'ok' && typeof confirm === 'string' ? 'working' : 'failed',
  );

  useEffect(() => {
    if (status !== 'ok' || typeof confirm !== 'string') return;
    let alive = true;
    void gcalConfirm(confirm).then((r) => {
      if (alive) setOutcome(r.ok ? 'ok' : 'failed');
    });
    return () => {
      alive = false;
    };
  }, [status, confirm]);

  return (
    <Screen topInset>
      <View style={styles.centered}>
        <ThemedText style={styles.spaced}>
          {outcome === 'failed' ? t('gcal.callback.failed') : t('gcal.callback.ok')}
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
