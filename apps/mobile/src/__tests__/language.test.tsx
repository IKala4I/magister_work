/**
 * ADR-0023: the language switch. What a person does in Settings, and everything that has to
 * follow from it — the catalog in force, the stored choice, the profile row, the OS-side copy,
 * and the root layout's remount key.
 */
jest.mock('../db/client', () => ({ db: {} }));
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
  reminderExactness: () => 'not_applicable',
  isExactAlarmPromptDismissed: () => true,
  dismissExactAlarmPrompt: () => {},
  openExactAlarmSettingsAction: () => {},
}));
jest.mock('../privacy/exportData', () => ({ exportDataAction: jest.fn() }));
jest.mock('../privacy/deleteAccount', () => ({ deleteAccountAction: jest.fn() }));
jest.mock('../db/useLiveRows', () => ({
  useLiveRows: () => [],
  useLiveRowsState: () => ({ rows: [], ready: true }),
}));
jest.mock('../db/useProfile', () => ({
  useOnboardingComplete: () => true,
  useCurrentProfile: () => undefined,
}));

const mock_updateProfileLocale = jest.fn();
jest.mock('../db/profile', () => ({
  getProfile: () => undefined,
  updateProfileLocale: (...args: unknown[]) => mock_updateProfileLocale(...args),
}));
jest.mock('../auth/identity', () => ({ currentUserId: () => 'user-1' }));
jest.mock('../sync/engine', () => ({ scheduleSync: jest.fn(), syncNow: jest.fn() }));
const mock_reRegisterNotificationCopy = jest.fn(() => Promise.resolve());
const mock_runNotificationScheduler = jest.fn(() => Promise.resolve());
jest.mock('../notifications/setup', () => ({
  reRegisterNotificationCopy: () => mock_reRegisterNotificationCopy(),
  getPermissionState: () => Promise.resolve('granted'),
}));
jest.mock('../notifications/scheduler', () => ({
  runNotificationScheduler: () => mock_runNotificationScheduler(),
}));
const mock_track = jest.fn();
jest.mock('../observability/analytics', () => ({
  track: (...args: unknown[]) => mock_track(...args),
  isAnalyticsEnabled: () => true,
  setAnalyticsEnabled: jest.fn(),
  initAnalytics: jest.fn(),
}));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
}));

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SettingsScreen from '../../app/settings';
import { changeLanguageAction } from '../domain/languageActions';
import { getActiveLocale, resetLocaleForTests, t } from '../i18n';
import { en } from '../i18n/en';
import { uk } from '../i18n/uk';
import { applyLanguage, useLanguageStore } from '../state/language';
import { appStorage, StorageKeys } from '../storage/mmkv';

const withSafeArea = (ui: ReactElement) => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }}
  >
    {ui}
  </SafeAreaProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  appStorage.set(StorageKeys.language, 'system');
  useLanguageStore.setState({ preference: 'system', locale: 'en' });
  applyLanguage('system', ['en']);
});

afterEach(() => {
  resetLocaleForTests();
  useLanguageStore.setState({ preference: 'system', locale: 'en' });
  applyLanguage('system', ['en']);
});

describe('the switch in Settings', () => {
  it('offers System, English and Українська as one radio group', async () => {
    await render(withSafeArea(<SettingsScreen />));
    expect(screen.getByTestId('language-system')).toBeTruthy();
    expect(screen.getByTestId('language-en')).toBeTruthy();
    // The Ukrainian option is named in Ukrainian in every catalog — a list of languages you
    // cannot read is no help.
    expect(within(screen.getByTestId('language-uk')).getByText('Українська')).toBeTruthy();
  });

  it('names the section in the row label, so a screen reader can tell the two "System" rows apart', async () => {
    await render(withSafeArea(<SettingsScreen />));
    expect(screen.getByTestId('language-system').props.accessibilityLabel).toBe('Language: System');
    expect(screen.getByTestId('language-system').props.accessibilityLabel).not.toBe(
      en['settings.appearance.system'],
    );
  });

  it('tapping Українська switches the interface', async () => {
    await render(withSafeArea(<SettingsScreen />));
    expect(screen.getByText(en['settings.account.title'])).toBeTruthy();
    fireEvent.press(screen.getByTestId('language-uk'));
    expect(getActiveLocale()).toBe('uk');
    expect(t('settings.account.title')).toBe(uk['settings.account.title']);
    // The store carries the new catalog, which is what the root layout's remount key reads.
    expect(useLanguageStore.getState().locale).toBe('uk');
  });

  it('explains the English boundary only when the interface is not English', async () => {
    await render(withSafeArea(<SettingsScreen />));
    expect(screen.queryByTestId('language-boundary')).toBeNull();
    fireEvent.press(screen.getByTestId('language-uk'));
    const boundary = within(await screen.findByTestId('language-boundary'));
    expect(boundary.getByText(uk['settings.language.boundary.survey'])).toBeTruthy();
    expect(boundary.getByText(uk['settings.language.boundary.yourWords'])).toBeTruthy();
    expect(boundary.getByText(uk['settings.language.boundary.technical'])).toBeTruthy();
  });
});

describe('what a language change has to carry with it', () => {
  it('persists the choice, records it on the profile and re-renders the OS copy', () => {
    changeLanguageAction('uk');
    expect(appStorage.getString(StorageKeys.language)).toBe('uk');
    expect(useLanguageStore.getState().locale).toBe('uk');
    expect(mock_updateProfileLocale).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      locale: 'uk',
    });
    // Notification copy is rendered at schedule time and registered with the OS, so neither
    // updates itself: pending bodies are re-rendered and the categories/channels re-registered.
    expect(mock_reRegisterNotificationCopy).toHaveBeenCalled();
    expect(mock_runNotificationScheduler).toHaveBeenCalled();
    expect(mock_track).toHaveBeenCalledWith('language_changed', { locale: 'uk' });
  });

  it('does no work when the choice resolves to the language already in force', () => {
    changeLanguageAction('en');
    expect(mock_reRegisterNotificationCopy).not.toHaveBeenCalled();
    expect(mock_updateProfileLocale).not.toHaveBeenCalled();
    expect(mock_track).not.toHaveBeenCalled();
  });

  it('survives having no profile row yet (the welcome screen)', () => {
    mock_updateProfileLocale.mockImplementation(() => {
      throw new Error('no row');
    });
    expect(() => changeLanguageAction('uk')).not.toThrow();
    expect(appStorage.getString(StorageKeys.language)).toBe('uk');
    expect(getActiveLocale()).toBe('uk');
  });

  it('an explicit English choice holds on a Ukrainian phone', () => {
    expect(applyLanguage('en', ['uk'])).toBe('en');
    expect(applyLanguage('system', ['uk'])).toBe('uk');
  });
});
