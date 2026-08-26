/**
 * Sign in (FR-01): magic link primary, Google secondary (inert until the consent-screen
 * gate closes — the button surfaces the provider error as copy, never crashes). Warns when
 * this device already holds another account's data (the account-change wipe contract).
 */
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { getLastUserId } from '../../src/auth/identity';
import { sendMagicLink, signInWithGoogle } from '../../src/auth/flows';
import { t } from '../../src/i18n';
import { Button, Screen, ThemedText } from '../../src/ui/primitives';
import { useTheme } from '../../src/ui/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [errorKey, setErrorKey] = useState<
    | null
    | 'auth.signIn.error.invalidEmail'
    | 'auth.signIn.error.sendFailed'
    | 'auth.signIn.googleUnavailable'
  >(null);

  const send = async () => {
    setErrorKey(null);
    setState('sending');
    const result = await sendMagicLink(email.trim());
    if (result.ok) {
      setState('sent');
    } else {
      setState('idle');
      setErrorKey('auth.signIn.error.sendFailed');
    }
  };

  const submit = () => {
    if (!EMAIL_RE.test(email.trim())) {
      setErrorKey('auth.signIn.error.invalidEmail');
      return;
    }
    // Until P8, a different account signing in wipes this device's unsynced tasks
    // (cursor contract). The caption alone is easy to miss — confirm explicitly
    // (finding m10; the deep-link path is logged in docs/decisions/revisit.md).
    if (getLastUserId() !== null) {
      Alert.alert(t('auth.signIn.replace.title'), t('auth.signIn.replace.body'), [
        { text: t('auth.signIn.replace.cancel'), style: 'cancel' },
        { text: t('auth.signIn.replace.confirm'), onPress: () => void send() },
      ]);
      return;
    }
    void send();
  };

  const google = async () => {
    setErrorKey(null);
    const result = await signInWithGoogle();
    if (!result.ok && result.code !== 'cancelled') {
      setErrorKey('auth.signIn.googleUnavailable');
    }
  };

  if (state === 'sent') {
    return (
      <Screen>
        <View style={styles.centered}>
          <ThemedText variant="h1">{t('auth.signIn.sent.title')}</ThemedText>
          <ThemedText style={styles.spaced}>
            {t('auth.signIn.sent.body', { email: email.trim() })}
          </ThemedText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ThemedText variant="h1">{t('auth.signIn.title')}</ThemedText>
      {getLastUserId() !== null ? (
        <ThemedText variant="caption" style={styles.spaced}>
          {t('auth.signIn.differentAccountWarning')}
        </ThemedText>
      ) : null}

      <ThemedText variant="caption" style={styles.label}>
        {t('auth.signIn.emailLabel')}
      </ThemedText>
      <TextInput
        accessibilityLabel={t('auth.signIn.emailLabel')}
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.signIn.emailPlaceholder')}
        placeholderTextColor={theme.colors.textSecondary}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        style={[
          styles.input,
          { color: theme.colors.textPrimary, borderColor: theme.colors.textSecondary },
        ]}
      />
      {errorKey !== null ? (
        <ThemedText variant="caption" style={[styles.spaced, { color: theme.colors.warning }]}>
          {t(errorKey)}
        </ThemedText>
      ) : null}

      <Button
        label={t('auth.signIn.sendLink')}
        disabled={state === 'sending'}
        onPress={submit}
        style={styles.spacedTop}
      />
      <Button kind="secondary" label={t('auth.signIn.google')} onPress={() => void google()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', gap: 8 },
  label: { marginTop: 20, marginBottom: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  spaced: { marginTop: 8 },
  spacedTop: { marginTop: 16 },
});
