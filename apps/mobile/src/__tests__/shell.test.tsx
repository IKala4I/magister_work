/**
 * Tab-shell smoke tests: every File 02 §3.5 screen renders its catalog copy, the settings
 * modal's appearance control works end-to-end (store + MMKV flag), and the router wiring
 * mounts the Today tab at '/' with the tab bar present.
 */
// The Inbox screen reads the live DB; tests never open the native database (P2 rule),
// so the client and the live-query hook are stubbed to an empty inbox here.
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
jest.mock('../db/useLiveRows', () => ({
  useLiveRows: () => [],
  useLiveRowsState: () => ({ rows: [], ready: true }),
}));
// P7: the Today tab runs the lazy lapse scan on mount — a DB write path, mocked here like the DB
jest.mock('../sync/useLapseScan', () => ({
  useLapseScan: () => ({ diagnosticTask: null, dismissDiagnostic: () => {} }),
}));
// The shell tests cover an onboarded user; the UC-01 gate has its own suite (P4).
jest.mock('../db/useProfile', () => ({
  useOnboardingComplete: () => true,
  useCurrentProfile: () => undefined,
}));
jest.mock('../domain/taskActions', () => ({
  createTaskAction: jest.fn(),
  updateTaskAction: jest.fn(),
  deleteTaskAction: jest.fn(),
  restoreTaskAction: jest.fn(),
}));
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
}));

import { renderRouter, screen } from 'expo-router/testing-library';
import { render, fireEvent, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';

import TabsLayout from '../../app/(tabs)/_layout';
import TodayScreen from '../../app/(tabs)/index';
import InboxScreen from '../../app/(tabs)/inbox';
import FocusScreen from '../../app/(tabs)/focus';
import InsightsScreen from '../../app/(tabs)/insights';
import SettingsScreen from '../../app/settings';
import { en } from '../i18n/en';
import { useAppearanceStore } from '../state/appearance';
import { appStorage, StorageKeys } from '../storage/mmkv';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function withSafeArea(ui: ReactElement) {
  return <SafeAreaProvider initialMetrics={initialMetrics}>{ui}</SafeAreaProvider>;
}

beforeEach(() => {
  appStorage.clearAll();
  useAppearanceStore.setState({ preference: 'system' });
});

describe('tab screens render their catalog copy', () => {
  it.each([
    ['Today', TodayScreen, en['today.empty.title'], en['today.empty.body']],
    ['Inbox', InboxScreen, en['inbox.empty.title'], en['inbox.empty.body']],
    ['Focus', FocusScreen, en['focus.empty.title'], en['focus.empty.body']],
    ['Insights', InsightsScreen, en['insights.empty.title'], en['insights.empty.body']],
  ] as const)('%s', async (_name, Component, title, body) => {
    await render(withSafeArea(<Component />));
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(body)).toBeTruthy();
  });
});

describe('settings appearance control', () => {
  it('renders the three preferences as a radio group', async () => {
    await render(withSafeArea(<SettingsScreen />));
    expect(screen.getByText(en['settings.appearance.system'])).toBeTruthy();
    expect(screen.getByText(en['settings.appearance.light'])).toBeTruthy();
    expect(screen.getByText(en['settings.appearance.dark'])).toBeTruthy();
    // P10 added the ritual-time radios to Settings; the appearance group is the three labelled ones
    const appearance = [
      en['settings.appearance.system'],
      en['settings.appearance.light'],
      en['settings.appearance.dark'],
    ];
    expect(
      screen.getAllByRole('radio').filter((n) => appearance.includes(n.props.accessibilityLabel)),
    ).toHaveLength(3);
  });

  it('selecting Dark updates the store and persists the MMKV flag', async () => {
    await render(withSafeArea(<SettingsScreen />));
    await fireEvent.press(screen.getByText(en['settings.appearance.dark']));
    expect(useAppearanceStore.getState().preference).toBe('dark');
    expect(appStorage.getString(StorageKeys.schemePreference)).toBe('dark');
  });

  it('the selected option is exposed via accessibilityState (NFR-A1)', async () => {
    useAppearanceStore.getState().setPreference('light');
    await render(withSafeArea(<SettingsScreen />));
    const appearance = [
      en['settings.appearance.system'],
      en['settings.appearance.light'],
      en['settings.appearance.dark'],
    ];
    const selected = screen
      .getAllByRole('radio')
      .filter((node) => appearance.includes(node.props.accessibilityLabel))
      .filter((node) => node.props.accessibilityState?.checked === true);
    expect(selected).toHaveLength(1);
  });
});

describe('router shell', () => {
  it("mounts the Today tab at '/' inside the tab layout", async () => {
    await renderRouter(
      {
        '(tabs)/_layout': TabsLayout,
        '(tabs)/index': TodayScreen,
        '(tabs)/inbox': InboxScreen,
        '(tabs)/focus': FocusScreen,
        '(tabs)/insights': InsightsScreen,
        settings: SettingsScreen,
      },
      { initialUrl: '/' },
    );
    expect(screen.getByText(en['today.empty.title'])).toBeTruthy();
    // Tab bar shows all four File 02 §3.5 destinations.
    expect(screen.getAllByText(en['tabs.today']).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(en['tabs.inbox'])).toBeTruthy();
    expect(screen.getByText(en['tabs.focus'])).toBeTruthy();
    expect(screen.getByText(en['tabs.insights'])).toBeTruthy();
  });

  it('a tab exposes its name only — the icon glyph is hidden from assistive tech (NFR-A1, hardware pass #8)', async () => {
    await renderRouter(
      {
        '(tabs)/_layout': TabsLayout,
        '(tabs)/index': TodayScreen,
        '(tabs)/inbox': InboxScreen,
        '(tabs)/focus': FocusScreen,
        '(tabs)/insights': InsightsScreen,
        settings: SettingsScreen,
      },
      { initialUrl: '/' },
    );
    for (const name of [
      en['tabs.today'],
      en['tabs.inbox'],
      en['tabs.focus'],
      en['tabs.insights'],
    ]) {
      // jest runs as iOS, where bottom-tabs composes "<name>, tab, n of 4" itself; Android
      // composes from the children, so what matters is which children are accessible
      const tab = screen.getByRole('button', { name: new RegExp(`^${name}, tab`) });
      const spoken = within(tab).getAllByText(/\S/);
      expect(spoken.map((node) => node.props.children)).toEqual([name]);
      // the glyph Texts are still rendered — they are hidden, not gone
      expect(
        within(tab).getAllByText(/\S/, { includeHiddenElements: true }).length,
      ).toBeGreaterThan(1);
    }
  });
});
