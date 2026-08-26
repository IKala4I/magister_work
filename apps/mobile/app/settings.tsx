/**
 * Settings (modal). P2 shipped the appearance preference; P4 adds the account section
 * (FR-01: trial status, anonymous→email conversion, sign-in/out). Notification and
 * working-hours controls land with their phases (P10).
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { isAuthAvailable } from '../src/auth/client';
import { convertAnonymousToEmail, signOut } from '../src/auth/flows';
import { useSessionStore } from '../src/auth/session';
import { t, type MessageKey } from '../src/i18n';
import {
  SCHEME_PREFERENCES,
  useAppearanceStore,
  type SchemePreference,
} from '../src/state/appearance';
import { Button, Screen, ThemedText } from '../src/ui/primitives';
import { useTheme } from '../src/ui/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AccountSection() {
  const theme = useTheme();
  const router = useRouter();
  const session = useSessionStore();
  const [email, setEmail] = useState('');
  const [convertState, setConvertState] = useState<
    'idle' | 'editing' | 'sent' | 'email_exists' | 'failed'
  >('idle');

  if (!isAuthAvailable()) {
    return <ThemedText variant="caption">{t('settings.account.localOnly')}</ThemedText>;
  }

  if (session.status !== 'signed_in') {
    return (
      <Button
        kind="secondary"
        label={t('settings.account.signIn')}
        onPress={() => router.push('/auth/sign-in')}
      />
    );
  }

  const convert = async () => {
    if (!EMAIL_RE.test(email.trim())) return;
    const result = await convertAnonymousToEmail(email.trim());
    setConvertState(
      result.ok ? 'sent' : result.code === 'email_exists' ? 'email_exists' : 'failed',
    );
  };

  return (
    <View style={styles.accountBlock}>
      {session.isAnonymous ? (
        <>
          <ThemedText>{t('settings.account.anonymous')}</ThemedText>
          <ThemedText variant="caption">{t('settings.account.anonymousHint')}</ThemedText>
          {convertState === 'sent' ? (
            <ThemedText variant="caption">
              {t('settings.account.confirmSent', { email: email.trim() })}
            </ThemedText>
          ) : convertState === 'email_exists' ? (
            <ThemedText variant="caption">{t('settings.account.emailExists')}</ThemedText>
          ) : convertState === 'editing' || convertState === 'failed' ? (
            <>
              {convertState === 'failed' ? (
                <ThemedText variant="caption" style={{ color: theme.colors.warning }}>
                  {t('auth.signIn.error.sendFailed')}
                </ThemedText>
              ) : null}
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
                  styles.emailInput,
                  { color: theme.colors.textPrimary, borderColor: theme.colors.textSecondary },
                ]}
              />
              <Button label={t('settings.account.addEmail')} onPress={() => void convert()} />
            </>
          ) : (
            <Button
              label={t('settings.account.addEmail')}
              onPress={() => setConvertState('editing')}
            />
          )}
        </>
      ) : (
        <ThemedText>{t('settings.account.signedInAs', { email: session.email ?? '' })}</ThemedText>
      )}
      <Button
        kind="secondary"
        label={t('settings.account.signOut')}
        onPress={() => void signOut()}
      />
    </View>
  );
}

const PREFERENCE_LABELS: Record<SchemePreference, MessageKey> = {
  system: 'settings.appearance.system',
  light: 'settings.appearance.light',
  dark: 'settings.appearance.dark',
};

export default function SettingsScreen() {
  const theme = useTheme();
  const preference = useAppearanceStore((s) => s.preference);
  const setPreference = useAppearanceStore((s) => s.setPreference);

  return (
    <Screen>
      <ThemedText variant="h2" style={styles.sectionTitle}>
        {t('settings.account.title')}
      </ThemedText>
      <AccountSection />
      <ThemedText variant="h2" style={styles.sectionTitle}>
        {t('settings.appearance.title')}
      </ThemedText>
      <View accessibilityRole="radiogroup">
        {SCHEME_PREFERENCES.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: option === preference }}
            accessibilityLabel={t(PREFERENCE_LABELS[option])}
            onPress={() => setPreference(option)}
            style={styles.row}
          >
            <ThemedText>{t(PREFERENCE_LABELS[option])}</ThemedText>
            {option === preference ? (
              <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
            ) : null}
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { marginTop: 8, marginBottom: 12 },
  accountBlock: { gap: 10, marginBottom: 12 },
  emailInput: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  // ≥44 px touch target (NFR-A1)
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
