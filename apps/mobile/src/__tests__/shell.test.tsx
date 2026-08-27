/**
 * Tab-shell smoke tests: every File 02 §3.5 screen renders its catalog copy, the settings
 * modal's appearance control works end-to-end (store + MMKV flag), and the router wiring
 * mounts the Today tab at '/' with the tab bar present.
 */
// The Inbox screen reads the live DB; tests never open the native database (P2 rule),
// so the client and the live-query hook are stubbed to an empty inbox here.
jest.mock('../db/client', () => ({ db: {} }));
jest.mock('../db/useLiveRows', () => ({ useLiveRows: () => [] }));
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
import { render, fireEvent } from '@testing-library/react-native';
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
    expect(screen.getAllByRole('radio')).toHaveLength(3);
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
    const selected = screen
      .getAllByRole('radio')
      .filter((node) => node.props.accessibilityState?.selected === true);
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
});
