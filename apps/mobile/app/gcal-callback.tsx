/**
 * Deep-link landing for the Google Calendar consent round trip
 * (hourwell://gcal-callback?status=ok&confirm=…, ADR-0012 §10). The edge function exchanged the
 * code and stored the refresh token server-side UNCONFIRMED; this device — the one that started
 * the consent — activates it with the one-shot confirm token under its own session (a consent
 * that landed on another person's phone is refused there and purged). Cold and warm starts
 * both land here; the in-app flow (src/sync/gcal.ts) confirms itself when the browser session
 * returns, so a second confirm from this route finds the token already consumed — harmless.
 * Once the confirm lands the screen says so and returns to Settings by itself after
 * `GCAL_CALLBACK_LEAVE_MS`; before, it showed the "connected" copy for both the working and the
 * done state and never left (the owner waited five minutes on the Pixel — hardware pass
 * 2026-09-07 item 43). A failure stays until "Back to settings".
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { t } from '../src/i18n';
import { gcalConfirm } from '../src/sync/gcal';
import { Button, Screen, ThemedText } from '../src/ui/primitives';

/** How long the "connected" line is shown before the screen returns to Settings on its own. */
export const GCAL_CALLBACK_LEAVE_MS = 1500;

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

  useEffect(() => {
    if (outcome === 'working') return;
    // `accessibilityLiveRegion` is Android-only; VoiceOver needs the announcement
    AccessibilityInfo.announceForAccessibility(
      outcome === 'ok' ? t('gcal.callback.ok') : t('gcal.callback.failed'),
    );
  }, [outcome]);

  useEffect(() => {
    if (outcome !== 'ok') return undefined;
    const timer = setTimeout(() => router.replace('/settings'), GCAL_CALLBACK_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [outcome, router]);

  const copy =
    outcome === 'failed'
      ? t('gcal.callback.failed')
      : outcome === 'working'
        ? t('gcal.callback.working')
        : t('gcal.callback.ok');

  return (
    <Screen topInset>
      <View style={styles.centered}>
        <ThemedText style={styles.spaced} accessibilityLiveRegion="polite">
          {copy}
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
