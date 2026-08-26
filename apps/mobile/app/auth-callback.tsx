/**
 * Deep-link landing for magic links + OAuth (hourwell://auth-callback). expo-router
 * navigates here for both cold and warm starts; the URL (with its one-shot ?code=) is read
 * from the Linking API and exchanged for a session (PKCE only — see createSessionFromUrl),
 * then the user continues wherever the routing gate sends them. A replayed/expired link on
 * an already-signed-in device counts as done (finding m6), and failure always offers a way
 * back to sign-in instead of a dead end.
 */
import * as Linking from 'expo-linking';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { createSessionFromUrl } from '../src/auth/flows';
import { useSessionStore } from '../src/auth/session';
import { t } from '../src/i18n';
import { Button, Screen, ThemedText } from '../src/ui/primitives';
import { useTheme } from '../src/ui/theme';

export default function AuthCallbackScreen() {
  const theme = useTheme();
  const router = useRouter();
  const url = Linking.useURL();
  const signedIn = useSessionStore((s) => s.status === 'signed_in');
  const consumed = useRef<string | null>(null);
  const [outcome, setOutcome] = useState<'working' | 'done' | 'failed'>('working');

  useEffect(() => {
    if (!url || consumed.current === url) return;
    consumed.current = url; // auth codes are one-shot: never exchange the same URL twice
    void createSessionFromUrl(url).then((result) => {
      setOutcome(result.ok ? 'done' : 'failed');
    });
  }, [url]);

  if (outcome === 'done' || (outcome === 'failed' && signedIn)) return <Redirect href="/(tabs)" />;

  return (
    <Screen topInset>
      <View style={styles.centered}>
        {outcome === 'working' ? (
          <>
            <ActivityIndicator color={theme.colors.primary} />
            <ThemedText style={styles.spaced}>{t('auth.callback.working')}</ThemedText>
          </>
        ) : (
          <>
            <ThemedText style={styles.spaced}>{t('auth.signIn.error.linkFailed')}</ThemedText>
            <Button
              label={t('auth.callback.back')}
              onPress={() => router.replace('/auth/sign-in')}
              style={styles.spaced}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  spaced: { marginTop: 12 },
});
