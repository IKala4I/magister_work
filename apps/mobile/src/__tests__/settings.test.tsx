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
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SettingsScreen from '../../app/settings';
import { useSessionStore } from '../auth/session';
import { en } from '../i18n/en';
import { useSyncStore } from '../state/sync';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const withSafeArea = (ui: ReactElement) => (
  <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>
);

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
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
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
    expect(alert).toHaveBeenCalledWith(
      en['settings.gcal.disconnect.title'],
      en['settings.gcal.disconnect.body'],
      expect.any(Array),
    );
    expect(mockGcal.disconnect).not.toHaveBeenCalled();
    alert.mockRestore();
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
