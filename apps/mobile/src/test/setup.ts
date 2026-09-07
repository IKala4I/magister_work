/**
 * Shared jest setup. Native-module seams that nearly every component test needs:
 * expo-localization (locale detection) is mocked to an English device; react-native-mmkv
 * is replaced via moduleNameMapper (see package.json).
 */
// Reanimated 4 under jest: the worklets runtime is mocked per its testing guide (verified
// 2026-09-06, docs/versions.md); `setUpTests()` runs in setupAfterEnv.ts — the in-app dialog is
// the first animated surface (File 02 §3.4).
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en' }],
  getCalendars: () => [{ timeZone: 'Europe/Kyiv' }],
}));

// P10: expo-notifications has no native module under jest — a quiet default so any screen that
// pulls the scheduler/responder in renders; suites that assert on it install their own mock.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: false, canAskAgain: true, status: 'undetermined' }),
  ),
  requestPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: false, canAskAgain: false, status: 'denied' }),
  ),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  dismissAllNotificationsAsync: jest.fn(() => Promise.resolve()),
  dismissNotificationAsync: jest.fn(() => Promise.resolve()),
  getPresentedNotificationsAsync: jest.fn(() => Promise.resolve([])),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  useLastNotificationResponse: jest.fn(() => null),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
}));
