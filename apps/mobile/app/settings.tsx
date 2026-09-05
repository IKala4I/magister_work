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
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

import { isAuthAvailable } from '../src/auth/client';
import { convertAnonymousToEmail, signOut } from '../src/auth/flows';
import { useSessionStore } from '../src/auth/session';
import { TASK_CATEGORIES } from '../src/db/schema';
import type { TaskCategory } from '../src/db/tasks';
import { useCurrentProfile } from '../src/db/useProfile';
import {
  enableRemindersAction,
  openExactAlarmSettingsAction,
  reminderExactness,
  reminderPermissionState,
  updateNotificationSettingsAction,
} from '../src/domain/notificationActions';
import { notificationSettingsOf, RITUAL_TIME_PRESETS } from '../src/domain/notificationSettings';
import { formatRelative } from '../src/domain/relativeTime';
import { t, type MessageKey } from '../src/i18n';
import type { PermissionState } from '../src/notifications/setup';
import type { ExactAlarmState } from '../modules/exact-alarm';
import { isAnalyticsEnabled, setAnalyticsEnabled } from '../src/observability/analytics';
import { deleteAccountAction } from '../src/privacy/deleteAccount';
import { exportDataAction } from '../src/privacy/exportData';
import {
  isAnalyticsOptedOut,
  isCrashReportsOptedOut,
  setAnalyticsOptedOut,
  setCrashReportsOptedOut,
} from '../src/privacy/state';
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
                <ThemedText variant="caption" tone="secondary">
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
        <ThemedText variant="caption" tone="secondary">
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

const CATEGORY_LABELS: Record<TaskCategory, MessageKey> = {
  deep: 'task.category.deep',
  admin: 'task.category.admin',
  physical: 'task.category.physical',
  learning: 'task.category.learning',
};

/** FR-50 / FR-26 preferences (ADR-0014 §5) — profile settings through the outbox. */
function NotificationsSection() {
  const theme = useTheme();
  const profile = useCurrentProfile();
  const settings = notificationSettingsOf(profile?.settings ?? null);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [exactness, setExactness] = useState<ExactAlarmState | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      setExactness(reminderExactness()); // FR-50 on Android 12+ (build 6)
      void reminderPermissionState().then((p) => {
        if (alive) setPermission(p);
      });
    };
    refresh();
    // back from the OS settings screen (Linking.openSettings): re-read (P10 adversarial #9)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  const remindersOn = settings.block_reminders && permission === 'granted';
  const toggleReminders = async (value: boolean) => {
    if (!value) {
      updateNotificationSettingsAction({ block_reminders: false });
      return;
    }
    setPermission(await enableRemindersAction('settings'));
  };
  const toggleMute = (category: TaskCategory) => {
    const muted = settings.muted_categories.includes(category)
      ? settings.muted_categories.filter((c) => c !== category)
      : [...settings.muted_categories, category];
    updateNotificationSettingsAction({ muted_categories: muted });
  };
  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <ThemedText>{t('settings.notifications.reminders')}</ThemedText>
          <ThemedText variant="caption" tone="secondary">
            {t('settings.notifications.reminders.hint')}
          </ThemedText>
        </View>
        <Switch
          accessibilityRole="switch"
          accessibilityLabel={t('settings.notifications.reminders')}
          value={remindersOn}
          onValueChange={(v) => void toggleReminders(v)}
          trackColor={{ true: theme.colors.primary }}
        />
      </View>
      {settings.block_reminders && permission === 'denied' ? (
        <View style={styles.block}>
          <ThemedText variant="caption" tone="secondary">
            {t('settings.notifications.reminders.denied')}
          </ThemedText>
          <Button
            kind="secondary"
            label={t('settings.notifications.openSettings')}
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : null}
      {settings.block_reminders && permission === 'granted' && exactness === 'denied' ? (
        <View style={styles.block}>
          <ThemedText variant="caption" tone="secondary">
            {t('settings.notifications.exactAlarm.hint')}
          </ThemedText>
          <Button
            kind="secondary"
            label={t('settings.notifications.exactAlarm.allow')}
            onPress={() => openExactAlarmSettingsAction('settings')}
          />
        </View>
      ) : null}
      <ThemedText variant="caption" tone="secondary">
        {t('settings.notifications.mute')}
      </ThemedText>
      <View style={styles.chips}>
        {TASK_CATEGORIES.map((category) => {
          const muted = settings.muted_categories.includes(category);
          return (
            <Pressable
              key={category}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: muted }}
              accessibilityLabel={t('settings.notifications.mute.a11y', {
                category: t(CATEGORY_LABELS[category]),
              })}
              onPress={() => toggleMute(category)}
              style={[
                styles.chip,
                { borderColor: theme.colors.primary },
                muted && { backgroundColor: theme.colors.primaryContainer },
              ]}
            >
              <ThemedText variant="caption">{t(CATEGORY_LABELS[category])}</ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <ThemedText>{t('settings.notifications.ritual')}</ThemedText>
          <ThemedText variant="caption" tone="secondary">
            {t('settings.notifications.ritual.hint')}
          </ThemedText>
        </View>
        <Switch
          accessibilityRole="switch"
          accessibilityLabel={t('settings.notifications.ritual')}
          value={settings.evening_ritual}
          onValueChange={(v) => updateNotificationSettingsAction({ evening_ritual: v })}
          trackColor={{ true: theme.colors.primary }}
        />
      </View>
      {settings.evening_ritual ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('settings.notifications.ritual.time')}
        >
          <ThemedText variant="caption" tone="secondary">
            {t('settings.notifications.ritual.time')}
          </ThemedText>
          <View style={styles.chips}>
            {RITUAL_TIME_PRESETS.map((time) => {
              const selected = settings.evening_ritual_time === time;
              return (
                <Pressable
                  key={time}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={t('settings.notifications.ritual.time.a11y', { time })}
                  onPress={() => updateNotificationSettingsAction({ evening_ritual_time: time })}
                  style={[
                    styles.chip,
                    { borderColor: theme.colors.primary },
                    selected && { backgroundColor: theme.colors.primaryContainer },
                  ]}
                >
                  <ThemedText variant="caption" mono>
                    {time}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <ThemedText variant="caption" tone="secondary">
        {t('settings.notifications.cap')}
      </ThemedText>
    </View>
  );
}

/** FR-42 / UC-10 (ADR-0014 §7–§9): export to the share sheet; erasure with two confirmations. */
function DataSection() {
  const router = useRouter();
  const [message, setMessage] = useState<MessageKey | null>(null);
  const [messageParams, setMessageParams] = useState<Record<string, string | number> | undefined>();
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const runExport = async () => {
    setBusy('export');
    setMessage('settings.data.export.working');
    setMessageParams(undefined);
    const r = await exportDataAction();
    setBusy(null);
    if (r.ok) {
      setMessage('settings.data.export.done');
      setMessageParams({ tables: r.tables });
    } else if (r.code === 'offline') setMessage('settings.data.export.offline');
    else if (r.code === 'no_session') setMessage('settings.data.export.noSession');
    else if (r.code === 'share_unavailable') setMessage('settings.data.export.shareUnavailable');
    else setMessage('settings.data.export.failed');
  };
  const runDelete = async () => {
    setBusy('delete');
    setMessage('settings.data.delete.working');
    setMessageParams(undefined);
    const r = await deleteAccountAction();
    setBusy(null);
    if (r.ok) {
      router.replace({
        pathname: '/account-deleted',
        params: { reference: r.reference, at: r.completedAt },
      });
      return;
    }
    if (r.code === 'offline') setMessage('settings.data.delete.offline');
    else if (r.code === 'no_session') setMessage('settings.data.delete.noSession');
    else setMessage('settings.data.delete.failed');
  };
  const confirmDelete = () =>
    Alert.alert(t('settings.data.delete.confirm1.title'), t('settings.data.delete.confirm1.body'), [
      { text: t('settings.data.delete.confirm1.cancel'), style: 'cancel' },
      {
        text: t('settings.data.delete.confirm1.next'),
        onPress: () =>
          Alert.alert(
            t('settings.data.delete.confirm2.title'),
            t('settings.data.delete.confirm2.body'),
            [
              { text: t('settings.data.delete.confirm2.cancel'), style: 'cancel' },
              {
                text: t('settings.data.delete.confirm2.confirm'),
                style: 'destructive',
                onPress: () => void runDelete(),
              },
            ],
          ),
      },
    ]);
  return (
    <View style={styles.block}>
      <ThemedText variant="caption" tone="secondary">
        {t('settings.data.export.hint')}
      </ThemedText>
      <Button
        label={t('settings.data.export')}
        kind="secondary"
        disabled={busy !== null}
        onPress={() => void runExport()}
      />
      <ThemedText variant="caption" tone="secondary">
        {t('settings.data.delete.hint')}
      </ThemedText>
      <Button
        label={t('settings.data.delete')}
        kind="secondary"
        disabled={busy !== null}
        onPress={confirmDelete}
      />
      {message ? (
        <ThemedText variant="caption" tone="secondary" accessibilityLiveRegion="polite">
          {t(message, messageParams)}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** ADR-0014 §12: SDK opt-outs. */
function PrivacySection() {
  const theme = useTheme();
  const [analytics, setAnalytics] = useState(!isAnalyticsOptedOut());
  const [crash, setCrash] = useState(!isCrashReportsOptedOut());
  const analyticsLive = isAnalyticsEnabled();
  return (
    <View style={styles.block}>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <ThemedText>{t('settings.privacy.analytics')}</ThemedText>
          <ThemedText variant="caption" tone="secondary">
            {t('settings.privacy.analytics.hint')}
          </ThemedText>
        </View>
        <Switch
          accessibilityRole="switch"
          accessibilityLabel={t('settings.privacy.analytics')}
          value={analytics}
          onValueChange={(v) => {
            setAnalyticsOptedOut(!v);
            setAnalyticsEnabled(v);
            setAnalytics(v);
          }}
          trackColor={{ true: theme.colors.primary }}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <ThemedText>{t('settings.privacy.crash')}</ThemedText>
          <ThemedText variant="caption" tone="secondary">
            {t('settings.privacy.crash.hint')}
          </ThemedText>
        </View>
        <Switch
          accessibilityRole="switch"
          accessibilityLabel={t('settings.privacy.crash')}
          value={crash}
          onValueChange={(v) => {
            setCrashReportsOptedOut(!v);
            setCrash(v);
          }}
          trackColor={{ true: theme.colors.primary }}
        />
      </View>
      <ThemedText
        variant="caption"
        tone="secondary"
        accessibilityLabel={analyticsLive ? t('settings.privacy.on') : t('settings.privacy.off')}
      >
        {analyticsLive ? t('settings.privacy.on') : t('settings.privacy.off')}
      </ThemedText>
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
      {/* A real scroll container (hardware pass 2026-09-02 16:2x, FR-42 / NFR-A2): the sections
          overflow every phone — on the Pixel 7a at 1× the content ended at the mute chips and
          My data / Privacy / Appearance were unreachable, with no scrollable node at all. Plain
          ScrollView: the native-stack modal keeps its swipe-down dismiss, no nested gesture
          container. Screen already pads the bottom safe area around it. */}
      <ScrollView
        testID="settings-scroll"
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
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
          {t('settings.notifications.title')}
        </ThemedText>
        <NotificationsSection />
        {isAuthAvailable() ? (
          <>
            <ThemedText variant="h2" style={styles.sectionTitle}>
              {t('settings.data.title')}
            </ThemedText>
            <DataSection />
          </>
        ) : null}
        <ThemedText variant="h2" style={styles.sectionTitle}>
          {t('settings.privacy.title')}
        </ThemedText>
        <PrivacySection />
        <ThemedText variant="h2" style={styles.sectionTitle}>
          {t('settings.appearance.title')}
        </ThemedText>
        <View accessibilityRole="radiogroup">
          {SCHEME_PREFERENCES.map((option) => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: option === preference }}
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
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // the last row clears the modal's bottom edge (Screen adds the safe-area inset outside)
  scroll: { paddingBottom: 24 },
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
    gap: 12,
  },
  rowText: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
