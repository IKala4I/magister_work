/**
 * Root layout flow (adversarial finding 8): splash hides on every terminal state —
 * fonts ready, fonts FAILED (system-fallback stack, File 02 §3.3), and migration
 * failure (visible error screen, never a silent hang).
 */
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: jest.fn(() => [true, null]),
}));
jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({
  useMigrations: jest.fn(() => ({ success: true, error: undefined })),
}));
jest.mock('../db/client', () => ({ db: {} }));
// P10: the tab shell mounts the FR-50 scheduler and the root layout the response listener —
// both touch the OS and the database; the shell tests are about navigation
jest.mock('../notifications/useNotificationScheduler', () => ({
  useNotificationScheduler: () => {},
}));
jest.mock('../notifications/NotificationResponder', () => ({ NotificationResponder: () => null }));
jest.mock('../domain/notificationActions', () => ({
  reminderPermissionState: () => Promise.resolve('granted'),
  isRemindersPromptDismissed: () => true,
  dismissRemindersPrompt: () => {},
  enableRemindersAction: () => Promise.resolve('granted'),
  updateNotificationSettingsAction: () => {},
}));
jest.mock('../privacy/exportData', () => ({ exportDataAction: jest.fn() }));
jest.mock('../privacy/deleteAccount', () => ({ deleteAccountAction: jest.fn() }));
// The Today tab (P6) reads plans/recommendations through live queries and wires the UC-03
// trigger; the shell test is about readiness, not planning.
jest.mock('../db/useLiveRows', () => ({ useLiveRows: () => [] }));
// P7: the Today tab runs the lazy lapse scan on mount — a DB write path, mocked here like the DB
jest.mock('../sync/useLapseScan', () => ({
  useLapseScan: () => ({ diagnosticTask: null, dismissDiagnostic: () => {} }),
}));
jest.mock('../sync/usePlanTrigger', () => ({
  usePlanTrigger: () => ({ requestManual: jest.fn() }),
}));
jest.mock('../../drizzle/migrations', () => ({}));
// The readiness tests cover an onboarded user; the UC-01 gate has its own suite (P4).
jest.mock('../db/useProfile', () => ({
  useOnboardingComplete: () => true,
  useCurrentProfile: () => undefined,
}));
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));

import { renderRouter, screen } from 'expo-router/testing-library';
import { useFonts } from 'expo-font';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import * as SplashScreen from 'expo-splash-screen';

import RootLayout from '../../app/_layout';
import TabsLayout from '../../app/(tabs)/_layout';
import TodayScreen from '../../app/(tabs)/index';
import InboxScreen from '../../app/(tabs)/inbox';
import FocusScreen from '../../app/(tabs)/focus';
import InsightsScreen from '../../app/(tabs)/insights';
import SettingsScreen from '../../app/settings';
import { en } from '../i18n/en';

const useFontsMock = useFonts as jest.Mock;
const useMigrationsMock = useMigrations as jest.Mock;
const hideAsyncMock = SplashScreen.hideAsync as jest.Mock;

const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': TodayScreen,
  '(tabs)/inbox': InboxScreen,
  '(tabs)/focus': FocusScreen,
  '(tabs)/insights': InsightsScreen,
  settings: SettingsScreen,
};

beforeEach(() => {
  useFontsMock.mockReturnValue([true, null]);
  useMigrationsMock.mockReturnValue({ success: true, error: undefined });
  hideAsyncMock.mockClear();
});

describe('root layout readiness flow', () => {
  it('renders the shell and hides the splash when fonts and migrations are ready', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen.getByText(en['today.empty.title'])).toBeTruthy();
    expect(hideAsyncMock).toHaveBeenCalled();
  });

  it('holds the splash (renders nothing) while loading', async () => {
    useFontsMock.mockReturnValue([false, null]);
    useMigrationsMock.mockReturnValue({ success: false, error: undefined });
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen.queryByText(en['today.empty.title'])).toBeNull();
    expect(hideAsyncMock).not.toHaveBeenCalled();
  });

  it('a font error still opens the app on the system fallback stack (finding 2)', async () => {
    useFontsMock.mockReturnValue([false, new Error('font download failed')]);
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen.getByText(en['today.empty.title'])).toBeTruthy();
    expect(hideAsyncMock).toHaveBeenCalled();
  });

  it('a migration failure shows the visible error state, not a hang', async () => {
    useMigrationsMock.mockReturnValue({ success: false, error: new Error('migrate boom') });
    await renderRouter(routes, { initialUrl: '/' });
    expect(screen.getByText(en['db.migrationFailed.title'])).toBeTruthy();
    expect(screen.getByText(en['db.migrationFailed.body'])).toBeTruthy();
    expect(hideAsyncMock).toHaveBeenCalled();
  });
});
