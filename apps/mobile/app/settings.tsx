/**
 * Settings (modal). P2 shipped the appearance preference; P4 adds the account section
 * (FR-01: trial status, anonymous→email conversion, sign-in/out); P8 adds the sync status
 * (NFR-R1: last sync, queued changes, "Sync now") and the Google Calendar connection (FR-03:
 * busy import, opt-in write-back). Notification and working-hours controls land with their
 * phases (P10).
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { isAuthAvailable } from '../src/auth/client';
import { convertAnonymousToEmail, signOut } from '../src/auth/flows';
import { useSessionStore } from '../src/auth/session';
import { formatRelative } from '../src/domain/relativeTime';
import { t, type MessageKey } from '../src/i18n';
import {
  SCHEME_PREFERENCES,
  useAppearanceStore,
  type SchemePreference,
} from '../src/state/appearance';
import { useSyncStore, type SyncUiStatus } from '../src/state/sync';
import { syncNow } from '../src/sync/engine';
import { gcalConnect, gcalDisconnect, gcalSetWriteBack, gcalStatus } from '../src/sync/gcal';
import type { GcalStatus } from '../src/sync/types';
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
    <View style={styles.block}>
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
        onPress={() => {
          if (!session.isAnonymous) {
            void signOut();
            return;
          }
          // An anonymous account has no way back in — signing out orphans the server-side
          // profile and priors forever (finding m5). Confirm, steering toward conversion.
          Alert.alert(
            t('settings.account.signOutAnonymous.title'),
            t('settings.account.signOutAnonymous.body'),
            [
              { text: t('settings.account.signOutAnonymous.cancel'), style: 'cancel' },
              {
                text: t('settings.account.signOutAnonymous.confirm'),
                style: 'destructive',
                onPress: () => void signOut(),
              },
            ],
          );
        }}
      />
    </View>
  );
}

const SYNC_STATUS_KEYS: Record<SyncUiStatus, MessageKey> = {
  idle: 'settings.sync.status.idle',
  syncing: 'settings.sync.status.syncing',
  offline: 'settings.sync.status.offline',
  no_session: 'settings.sync.status.no_session',
  error: 'settings.sync.status.error',
};

function SyncSection() {
  const status = useSyncStore((s) => s.status);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const pendingOps = useSyncStore((s) => s.pendingOps);
  if (!isAuthAvailable()) return null;
  return (
    <View style={styles.block} accessibilityRole="summary">
      <ThemedText>{t(SYNC_STATUS_KEYS[status])}</ThemedText>
      <ThemedText variant="caption" tone="secondary">
        {lastSyncAt === null
          ? t('settings.sync.never')
          : t('settings.sync.last', { when: formatRelative(lastSyncAt) })}
      </ThemedText>
      {pendingOps > 0 ? (
        <ThemedText variant="caption" tone="secondary">
          {t('settings.sync.pending', { count: pendingOps })}
        </ThemedText>
      ) : null}
      <Button
        kind="secondary"
        label={t('settings.sync.now')}
        disabled={status === 'syncing'}
        onPress={() => void syncNow('manual')}
      />
    </View>
  );
}

function CalendarSection() {
  const theme = useTheme();
  const signedIn = useSessionStore((s) => s.status === 'signed_in');
  const [gcal, setGcal] = useState<GcalStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<MessageKey | null>(null);

  const refresh = useCallback(async () => {
    const r = await gcalStatus();
    if (r.ok) setGcal(r.status);
    else if (r.code === 'not_configured') setMessage('settings.gcal.notConfigured');
  }, []);

  useEffect(() => {
    if (signedIn) void refresh();
  }, [signedIn, refresh]);

  if (!isAuthAvailable() || !signedIn) return null;

  const run = async (action: () => Promise<Awaited<ReturnType<typeof gcalConnect>>>) => {
    setBusy(true);
    setMessage(null);
    const r = await action();
    setBusy(false);
    if (r.ok) setGcal(r.status);
    else if (r.code === 'not_configured') setMessage('settings.gcal.notConfigured');
    else if (r.code === 'cancelled') setMessage('settings.gcal.cancelled');
    else setMessage('settings.gcal.failed');
  };

  const connected = gcal?.connected === true;
  return (
    <View style={styles.block}>
      <ThemedText variant="caption" tone="secondary">
        {t('settings.gcal.body')}
      </ThemedText>
      {message ? (
        <ThemedText variant="caption" style={{ color: theme.colors.warning }}>
          {t(message)}
        </ThemedText>
      ) : null}
      {connected ? (
        <>
          <ThemedText>{t('settings.gcal.connected')}</ThemedText>
          {gcal?.last_synced_at ? (
            <ThemedText variant="caption" tone="secondary">
              {t('settings.gcal.lastSynced', {
                when: formatRelative(Date.parse(gcal.last_synced_at)),
              })}
            </ThemedText>
          ) : null}
          {gcal?.write_back ? (
            <>
              <ThemedText variant="caption">{t('settings.gcal.writeBackOn')}</ThemedText>
              <Button
                kind="secondary"
                label={t('settings.gcal.writeBackOff')}
                disabled={busy}
                onPress={() => void run(() => gcalSetWriteBack(false))}
              />
            </>
          ) : (
            <>
              <ThemedText variant="caption" tone="secondary">
                {t('settings.gcal.writeBackHint')}
              </ThemedText>
              <Button
                kind="secondary"
                label={t('settings.gcal.writeBack')}
                disabled={busy}
                onPress={() =>
                  void run(() =>
                    gcal?.scope === 'write' ? gcalSetWriteBack(true) : gcalConnect('write'),
                  )
                }
              />
            </>
          )}
          <Button
            kind="secondary"
            label={t('settings.gcal.disconnect')}
            disabled={busy}
            onPress={() =>
              Alert.alert(t('settings.gcal.disconnect.title'), t('settings.gcal.disconnect.body'), [
                { text: t('settings.gcal.disconnect.cancel'), style: 'cancel' },
                {
                  text: t('settings.gcal.disconnect.confirm'),
                  style: 'destructive',
                  onPress: () => void run(() => gcalDisconnect()),
                },
              ])
            }
          />
        </>
      ) : (
        <Button
          label={t('settings.gcal.connect')}
          disabled={busy}
          onPress={() => void run(() => gcalConnect('read'))}
        />
      )}
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
      {isAuthAvailable() ? (
        <>
          <ThemedText variant="h2" style={styles.sectionTitle}>
            {t('settings.sync.title')}
          </ThemedText>
          <SyncSection />
          <ThemedText variant="h2" style={styles.sectionTitle}>
            {t('settings.gcal.title')}
          </ThemedText>
          <CalendarSection />
        </>
      ) : null}
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
  block: { gap: 10, marginBottom: 12 },
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
