/**
 * initNotifications registers exactly one category — the ritual's, with its two actions — and
 * never a category without actions: Android's expo-notifications rejects those ("Must provide
 * at least one action"), and the empty block category used to be registered FIRST, so the
 * rejection silently skipped the ritual's category and the 20:00 ritual posted without
 * "Plan tomorrow" / "Adjust" (Pixel 7a, hardware pass 2026-09-04, FR-26).
 */
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('../../observability/analytics', () => ({ track: jest.fn() }));
import * as Notifications from 'expo-notifications';

import { ACTION_ACCEPT, ACTION_ADJUST, CATEGORY_RITUAL, initNotifications } from '../setup';

it('registers only the ritual category, with accept + adjust, never an empty one (FR-26)', async () => {
  initNotifications();
  await new Promise((r) => setTimeout(r, 0));
  const calls = (Notifications.setNotificationCategoryAsync as jest.Mock).mock.calls as Array<
    [string, Array<{ identifier: string; buttonTitle: string }>]
  >;
  expect(calls).toHaveLength(1);
  expect(calls[0]?.[0]).toBe(CATEGORY_RITUAL);
  expect(calls[0]?.[1].map((a) => a.identifier)).toEqual([ACTION_ACCEPT, ACTION_ADJUST]);
  for (const [, actions] of calls) expect(actions.length).toBeGreaterThan(0);
});
