/**
 * Deep-link landing for magic links + OAuth (hourwell://auth-callback). expo-router
 * navigates here for both cold and warm starts; the URL (with its one-shot ?code= or
 * #access_token fragment) is read from the Linking API and exchanged for a session, then
 * the user continues wherever the routing gate sends them.
 */
import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { createSessionFromUrl } from '../src/auth/flows';
import { t } from '../src/i18n';
import { Screen, ThemedText } from '../src/ui/primitives';
import { useTheme } from '../src/ui/theme';

export default function AuthCallbackScreen() {
  const theme = useTheme();
  const url = Linking.useURL();
  const consumed = useRef<string | null>(null);
  const [outcome, setOutcome] = useState<'working' | 'done' | 'failed'>('working');

  useEffect(() => {
    if (!url || consumed.current === url) return;
    consumed.current = url; // auth codes are one-shot: never exchange the same URL twice
    void createSessionFromUrl(url).then((result) => {
      setOutcome(result.ok ? 'done' : 'failed');
    });
  }, [url]);

  if (outcome === 'done') return <Redirect href="/(tabs)" />;

  return (
    <Screen>
      <View style={styles.centered}>
        {outcome === 'working' ? (
          <>
            <ActivityIndicator color={theme.colors.primary} />
            <ThemedText style={styles.spaced}>{t('auth.callback.working')}</ThemedText>
          </>
        ) : (
          <ThemedText>{t('auth.signIn.error.linkFailed')}</ThemedText>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  spaced: { marginTop: 12 },
});
