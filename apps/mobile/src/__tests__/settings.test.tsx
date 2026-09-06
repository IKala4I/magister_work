/**
 * Settings P8 sections: the sync status line + "Sync now" (NFR-R1) and the Google Calendar
 * connection (FR-03: connect, write-back opt-in, disconnect with a confirm). The auth client
 * is mocked as available and signed in; the sync engine and the calendar client are faked.
 */
jest.mock('../db/client', () => ({ db: {} }));
jest.mock('../auth/client', () => ({
  supabase: {},
  isAuthAvailable: () => true,
}));
const mockSyncNow = jest.fn<Promise<{ kind: string }>, [unknown]>(() =>
  Promise.resolve({ kind: 'synced' }),
);
jest.mock('../sync/engine', () => ({
  syncNow: (reason: unknown) => mockSyncNow(reason),
  scheduleSync: jest.fn(),
  wireSync: jest.fn(),
}));
const mockGcal = {
  status: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  setWriteBack: jest.fn(),
};
jest.mock('../sync/gcal', () => ({
  gcalStatus: () => mockGcal.status(),
  gcalConnect: (scope: string) => mockGcal.connect(scope),
  gcalDisconnect: () => mockGcal.disconnect(),
  gcalSetWriteBack: (enabled: boolean) => mockGcal.setWriteBack(enabled),
}));
jest.mock('../auth/flows', () => ({
  convertAnonymousToEmail: jest.fn(),
  signOut: jest.fn(),
}));
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
// P10 sections: profile settings, the notification actions, export/delete, the SDK toggles
const mockProfile = { settings: null as unknown };
jest.mock('../db/useProfile', () => ({
  useCurrentProfile: () => mockProfile,
  useOnboardingComplete: () => true,
}));
const mockNotify = {
  update: jest.fn(),
  enable: jest.fn<Promise<string>, [unknown]>(() => Promise.resolve('granted')),
  permission: jest.fn(() => Promise.resolve('granted')),
  exactness: 'not_applicable' as string,
  openExactSettings: jest.fn(),
};
jest.mock('../domain/notificationActions', () => ({
  updateNotificationSettingsAction: (...a: unknown[]) => mockNotify.update(...a),
  enableRemindersAction: (source: unknown) => mockNotify.enable(source),
  reminderPermissionState: () => mockNotify.permission(),
  reminderExactness: () => mockNotify.exactness,
  openExactAlarmSettingsAction: (source: unknown) => mockNotify.openExactSettings(source),
}));
const mockPrivacy = { exportData: jest.fn(), deleteAccount: jest.fn() };
jest.mock('../privacy/exportData', () => ({ exportDataAction: () => mockPrivacy.exportData() }));
jest.mock('../privacy/deleteAccount', () => ({
  deleteAccountAction: () => mockPrivacy.deleteAccount(),
}));
const mockAnalytics = { setEnabled: jest.fn(), enabled: true };
jest.mock('../observability/analytics', () => ({
  isAnalyticsEnabled: () => mockAnalytics.enabled,
  setAnalyticsEnabled: (v: boolean) => mockAnalytics.setEnabled(v),
  track: jest.fn(),
}));

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SettingsScreen from '../../app/settings';
import { useSessionStore } from '../auth/session';
import { en } from '../i18n/en';
import { isAnalyticsOptedOut } from '../privacy/state';
import { useSyncStore } from '../state/sync';
import { appStorage, StorageKeys } from '../storage/mmkv';
import { DialogHost, useDialogStore } from '../ui/dialog';
import { lightColors } from '../ui/tokens/colors';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
// the in-app dialog host renders next to the screen, as the root layout mounts it (ADR-0021)
const withSafeArea = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={initialMetrics}>
    {ui}
    <DialogHost />
  </SafeAreaProvider>
);
// a dialog action by label — scoped to the dialog's action row, since a site's own button may
// share the label (Settings "Disconnect" vs the dialog's "Disconnect")
const dialogButton = (label: string) =>
  within(screen.getByTestId('dialog-actions')).getByRole('button', { name: label });

const connected = {
  connected: true,
  scope: 'read',
  write_back: false,
  calendar_id: 'primary',
  last_synced_at: new Date().toISOString(),
  last_error: null,
  channel_expires_at: null,
  connected_at: new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  useDialogStore.setState({ current: null });
  useSessionStore.setState({
    status: 'signed_in',
    userId: 'u1',
    email: 'a@b.c',
    isAnonymous: false,
  });
  useSyncStore.setState({
    status: 'idle',
    lastSyncAt: null,
    pendingOps: 0,
    notice: null,
    pendingWipe: null,
  });
  mockGcal.status.mockResolvedValue({
    ok: true,
    status: { ...connected, connected: false, scope: null },
  });
});

describe('Settings — sync section', () => {
  it('shows the status, the never-synced line and pending count, and "Sync now" triggers a manual sync', async () => {
    useSyncStore.setState({ status: 'offline', pendingOps: 3, lastSyncAt: null });
    await render(withSafeArea(<SettingsScreen />));
    expect(screen.getByText(en['settings.sync.status.offline'])).toBeTruthy();
    expect(screen.getByText(en['settings.sync.never'])).toBeTruthy();
    expect(screen.getByText('3 changes waiting')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(en['settings.sync.now']));
    });
    expect(mockSyncNow).toHaveBeenCalledWith('manual');
  });

  it('shows the relative last-sync time when synced', async () => {
    useSyncStore.setState({ status: 'idle', lastSyncAt: Date.now() - 5 * 60_000 });
    await render(withSafeArea(<SettingsScreen />));
    expect(screen.getByText('Last synced 5 min ago')).toBeTruthy();
  });
});

describe('Settings — Google Calendar section', () => {
  it('offers Connect when not connected and starts the read-scope consent', async () => {
    mockGcal.connect.mockResolvedValue({ ok: true, status: connected });
    await render(withSafeArea(<SettingsScreen />));
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByText(en['settings.gcal.connect']));
    });
    expect(mockGcal.connect).toHaveBeenCalledWith('read');
    expect(screen.getByText(en['settings.gcal.connected'])).toBeTruthy();
  });

  it('when connected with the read scope, the write-back button asks for the write scope; disconnect confirms first', async () => {
    mockGcal.status.mockResolvedValue({ ok: true, status: connected });
    mockGcal.connect.mockResolvedValue({
      ok: true,
      status: { ...connected, scope: 'write', write_back: true },
    });
    mockGcal.disconnect.mockResolvedValue({ ok: true, status: { ...connected, connected: false } });
    await render(withSafeArea(<SettingsScreen />));
    await act(async () => {});
    expect(screen.getByText(en['settings.gcal.connected'])).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(en['settings.gcal.writeBack']));
    });
    expect(mockGcal.connect).toHaveBeenCalledWith('write');
    expect(screen.getByText(en['settings.gcal.writeBackOn'])).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(en['settings.gcal.disconnect']));
    });
    // the in-app dialog, destructive tone; nothing happens until it is confirmed
    expect(screen.getByTestId('dialog-gcal-disconnect')).toBeTruthy();
    expect(screen.getByRole('header', { name: en['settings.gcal.disconnect.title'] })).toBeTruthy();
    expect(screen.getByText(en['settings.gcal.disconnect.body'])).toBeTruthy();
    expect(mockGcal.disconnect).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(dialogButton(en['settings.gcal.disconnect.cancel']));
    });
    expect(mockGcal.disconnect).not.toHaveBeenCalled();
    // answered: the request is gone (the card is still fading out under real timers, by design)
    expect(useDialogStore.getState().current).toBeNull();
    await act(async () => {
      // the settings button, not the fading dialog's confirm (same label)
      fireEvent.press(
        within(screen.getByTestId('settings-scroll')).getByText(en['settings.gcal.disconnect']),
      );
    });
    await act(async () => {
      fireEvent.press(dialogButton(en['settings.gcal.disconnect.confirm']));
    });
    expect(mockGcal.disconnect).toHaveBeenCalledTimes(1);
  });

  it('turning write-back off uses set_write_back (no new consent)', async () => {
    mockGcal.status.mockResolvedValue({
      ok: true,
      status: { ...connected, scope: 'write', write_back: true },
    });
    mockGcal.setWriteBack.mockResolvedValue({
      ok: true,
      status: { ...connected, scope: 'write', write_back: false },
    });
    await render(withSafeArea(<SettingsScreen />));
    await act(async () => {});
    await act(async () => {
      fireEvent.press(screen.getByText(en['settings.gcal.writeBackOff']));
    });
    expect(mockGcal.setWriteBack).toHaveBeenCalledWith(false);
    expect(mockGcal.connect).not.toHaveBeenCalled();
  });

  it('surfaces the not-configured state calmly (the Google gate)', async () => {
    mockGcal.status.mockResolvedValue({ ok: false, code: 'not_configured' });
    await render(withSafeArea(<SettingsScreen />));
    await act(async () => {});
    expect(screen.getByText(en['settings.gcal.notConfigured'])).toBeTruthy();
  });
});

describe('Settings — notifications (FR-50 / FR-26, P10)', () => {
  beforeEach(() => {
    mockProfile.settings = null;
    mockNotify.permission.mockResolvedValue('granted');
    mockNotify.exactness = 'not_applicable';
  });
  it('renders the reminder switch, mute chips, the ritual switch and time presets from the profile', async () => {
    mockProfile.settings = {
      notifications: { muted_categories: ['admin'], evening_ritual_time: '21:00' },
    };
    await render(withSafeArea(<SettingsScreen />));
    await act(async () => {});
    expect(screen.getByLabelText(en['settings.notifications.reminders'])).toBeTruthy();
    const admin = screen.getByLabelText('Mute reminders for Admin');
    expect(admin.props.accessibilityState).toEqual({ checked: true });
    await fireEvent.press(screen.getByLabelText('Mute reminders for Deep work'));
    expect(mockNotify.update).toHaveBeenCalledWith({ muted_categories: ['admin', 'deep'] });
    await fireEvent.press(admin);
    expect(mockNotify.update).toHaveBeenCalledWith({ muted_categories: [] });
    expect(screen.getByLabelText('Evening time 21:00').props.accessibilityState).toEqual({
      checked: true,
    });
    await fireEvent.press(screen.getByLabelText('Evening time 19:00'));
    expect(mockNotify.update).toHaveBeenCalledWith({ evening_ritual_time: '19:00' });
    expect(screen.getByText(en['settings.notifications.cap'])).toBeTruthy();
  });
  it('turning reminders on asks the OS through the action; off is a plain settings write', async () => {
    mockNotify.permission.mockResolvedValue('undetermined');
    await render(withSafeArea(<SettingsScreen />));
    await act(async () => {});
    const sw = screen.getByLabelText(en['settings.notifications.reminders']);
    await fireEvent(sw, 'valueChange', true);
    expect(mockNotify.enable).toHaveBeenCalledWith('settings');
    await fireEvent(sw, 'valueChange', false);
    expect(mockNotify.update).toHaveBeenCalledWith({ block_reminders: false });
  });
  it('inexact alarms (Android 12+, build 6) show the hint and the system-screen button; exact ones nothing', async () => {
    mockNotify.exactness = 'denied';
    await render(withSafeArea(<SettingsScreen />));
    await act(async () => {});
    expect(screen.getByText(en['settings.notifications.exactAlarm.hint'])).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(en['settings.notifications.exactAlarm.allow']));
    expect(mockNotify.openExactSettings).toHaveBeenCalledWith('settings');
    mockNotify.exactness = 'allowed';
    await render(withSafeArea(<SettingsScreen />));
    await act(async () => {});
    expect(screen.queryByText(en['settings.notifications.exactAlarm.hint'])).toBeNull();
  });
  it('denied permission shows the calm hint with a system-settings link', async () => {
    mockNotify.permission.mockResolvedValue('denied');
    await render(withSafeArea(<SettingsScreen />));
    await act(async () => {});
    expect(screen.getByText(en['settings.notifications.reminders.denied'])).toBeTruthy();
    expect(screen.getByLabelText(en['settings.notifications.openSettings'])).toBeTruthy();
  });
});

describe('Settings — my data (FR-42, P10)', () => {
  it('export runs the action and reports the table count', async () => {
    mockPrivacy.exportData.mockResolvedValue({ ok: true, fileUri: 'file:///x', tables: 14 });
    await render(withSafeArea(<SettingsScreen />));
    await fireEvent.press(screen.getByLabelText(en['settings.data.export']));
    await act(async () => {});
    expect(mockPrivacy.exportData).toHaveBeenCalled();
    expect(screen.getByText('Export ready — 14 tables shared.')).toBeTruthy();
  });
  it('export failures are calm lines', async () => {
    mockPrivacy.exportData.mockResolvedValue({ ok: false, code: 'offline' });
    await render(withSafeArea(<SettingsScreen />));
    await fireEvent.press(screen.getByLabelText(en['settings.data.export']));
    await act(async () => {});
    expect(screen.getByText(en['settings.data.export.offline'])).toBeTruthy();
  });
  it('deletion needs two confirmations, then routes to the confirmation screen with the reference', async () => {
    mockPrivacy.deleteAccount.mockResolvedValue({
      ok: true,
      reference: 'audit-9',
      completedAt: '2026-09-05T10:00:00Z',
    });
    await render(withSafeArea(<SettingsScreen />));
    await act(async () => {
      fireEvent.press(screen.getByLabelText(en['settings.data.delete']));
    });
    // step 1: the neutral gate — "Continue" is not red, "Keep my account" is the way out
    expect(screen.getByTestId('dialog-delete-1')).toBeTruthy();
    expect(
      screen.getByRole('header', { name: en['settings.data.delete.confirm1.title'] }),
    ).toBeTruthy();
    const next = dialogButton(en['settings.data.delete.confirm1.next']);
    expect(
      Object.assign(
        {},
        ...[within(next).getByText(en['settings.data.delete.confirm1.next']).props.style].flat(
          Infinity,
        ),
      ).color,
    ).toBe(lightColors.primary);
    await act(async () => {
      fireEvent.press(next);
    });
    // step 2: destructive — the label in dangerText; nothing deleted yet
    expect(screen.queryByTestId('dialog-delete-1')).toBeNull();
    expect(screen.getByTestId('dialog-delete-2')).toBeTruthy();
    expect(
      screen.getByRole('header', { name: en['settings.data.delete.confirm2.title'] }),
    ).toBeTruthy();
    expect(mockPrivacy.deleteAccount).not.toHaveBeenCalled();
    const confirm = dialogButton(en['settings.data.delete.confirm2.confirm']);
    expect(
      Object.assign(
        {},
        ...[
          within(confirm).getByText(en['settings.data.delete.confirm2.confirm']).props.style,
        ].flat(Infinity),
      ).color,
    ).toBe(lightColors.dangerText);
    await act(async () => {
      fireEvent.press(confirm);
    });
    await act(async () => {});
    expect(mockPrivacy.deleteAccount).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/account-deleted',
      params: { reference: 'audit-9', at: '2026-09-05T10:00:00Z' },
    });
  });
  it('the Android back button on either step keeps the account', async () => {
    await render(withSafeArea(<SettingsScreen />));
    await act(async () => {
      fireEvent.press(screen.getByLabelText(en['settings.data.delete']));
    });
    await act(async () => {
      fireEvent(screen.getByTestId('dialog-delete-1'), 'requestClose');
    });
    expect(screen.queryByTestId('dialog-delete-2')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText(en['settings.data.delete']));
    });
    await act(async () => {
      fireEvent.press(dialogButton(en['settings.data.delete.confirm1.next']));
    });
    await act(async () => {
      fireEvent(screen.getByTestId('dialog-delete-2'), 'requestClose');
    });
    await act(async () => {});
    expect(mockPrivacy.deleteAccount).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
  it('a failed deletion changes nothing and says so', async () => {
    mockPrivacy.deleteAccount.mockResolvedValue({ ok: false, code: 'failed' });
    await render(withSafeArea(<SettingsScreen />));
    await act(async () => {
      fireEvent.press(screen.getByLabelText(en['settings.data.delete']));
    });
    await act(async () => {
      fireEvent.press(dialogButton(en['settings.data.delete.confirm1.next']));
    });
    await act(async () => {
      fireEvent.press(dialogButton(en['settings.data.delete.confirm2.confirm']));
    });
    await act(async () => {});
    expect(screen.getByText(en['settings.data.delete.failed'])).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('Settings — reachability (hardware pass 2026-09-02: the screen could not scroll)', () => {
  it('every section renders inside a real ScrollView — My data, Export and Appearance included', async () => {
    await render(withSafeArea(<SettingsScreen />));
    // the bug was reachability, not rendering: the sections were there, in a flex View that
    // no gesture could move — so the container itself is asserted, not only the copy
    const scroll = screen.getByTestId('settings-scroll');
    expect(scroll.type).toBe('RCTScrollView');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    for (const key of [
      'settings.notifications.title',
      'settings.data.title',
      'settings.data.export',
      'settings.privacy.title',
      'settings.appearance.title',
    ] as const) {
      expect(within(scroll).getByText(en[key])).toBeTruthy();
    }
  });
});

describe('Settings — privacy (ADR-0014 §12)', () => {
  afterEach(() => {
    appStorage.delete(StorageKeys.analyticsOptOut);
    appStorage.delete(StorageKeys.crashReportsOptOut);
  });
  it('the analytics switch writes the opt-out flag and drops the client', async () => {
    await render(withSafeArea(<SettingsScreen />));
    const sw = screen.getByLabelText(en['settings.privacy.analytics']);
    expect(sw.props.value).toBe(true);
    await fireEvent(sw, 'valueChange', false);
    expect(isAnalyticsOptedOut()).toBe(true);
    expect(mockAnalytics.setEnabled).toHaveBeenCalledWith(false);
  });
  it('the crash-reports switch writes its flag (applies at next launch)', async () => {
    await render(withSafeArea(<SettingsScreen />));
    await fireEvent(screen.getByLabelText(en['settings.privacy.crash']), 'valueChange', false);
    expect(appStorage.getString(StorageKeys.crashReportsOptOut)).toBe('1');
  });
});
