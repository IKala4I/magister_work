/**
 * UI-facing P10 notification actions: the settings write (profile row + `profile_update` op
 * through the outbox), the debounced sync, the categorical analytics mirror, and a scheduler
 * re-run so the OS reflects the new preference at once. Imports the device database, so
 * component tests mock this module (same shape as insightsActions.ts).
 */
import { Linking } from 'react-native';

import { currentUserId } from '../auth/identity';
import { db } from '../db/client';
import { getProfile, updateProfileSettings } from '../db/profile';
import type { LocalDb } from '../db/writes';
import { runNotificationScheduler } from '../notifications/scheduler';
import {
  getPermissionState,
  type PermissionState,
  requestPermission,
} from '../notifications/setup';
import { track } from '../observability/analytics';
import { appStorage, StorageKeys } from '../storage/mmkv';
import { scheduleSync } from '../sync/engine';
import {
  type ExactAlarmState,
  exactAlarmState,
  openExactAlarmSettings,
} from '../../modules/exact-alarm';

import {
  type NotificationSettings,
  notificationSettingsOf,
  withNotificationSettings,
} from './notificationSettings';

const localDb = db as unknown as LocalDb;

export function currentNotificationSettings(): NotificationSettings {
  return notificationSettingsOf(getProfile(localDb, currentUserId())?.settings ?? null);
}

export function updateNotificationSettingsAction(patch: Partial<NotificationSettings>): void {
  const userId = currentUserId();
  const row = getProfile(localDb, userId);
  if (row === undefined) return;
  updateProfileSettings(localDb, {
    userId,
    settings: withNotificationSettings(row.settings, patch),
    now: new Date(),
  });
  scheduleSync('write');
  void runNotificationScheduler();
}

/** The Today card / Settings toggle: ask the OS, then reschedule whatever the answer allows. */
export async function enableRemindersAction(
  source: 'today_card' | 'settings',
): Promise<PermissionState> {
  const state = await requestPermission(source);
  updateNotificationSettingsAction({ block_reminders: true });
  return state;
}

export function reminderPermissionState(): Promise<PermissionState> {
  return getPermissionState();
}

export function isRemindersPromptDismissed(): boolean {
  return appStorage.getString(StorageKeys.remindersPromptDismissed) === '1';
}

export function dismissRemindersPrompt(): void {
  appStorage.set(StorageKeys.remindersPromptDismissed, '1');
}

/**
 * FR-50 on Android 12+ (build 6): whether the OS lets Hourwell schedule reminders exactly.
 * `denied` on a fresh Android 13+ install until the user flips "Alarms & reminders" — the Today
 * card and the Settings row route there; `allowed` below Android 12 (every alarm is exact);
 * `not_applicable` on iOS; `unavailable` when the native module is missing on Android.
 */
export function reminderExactness(): ExactAlarmState {
  return exactAlarmState();
}

/**
 * The Today card / Settings row: open the system "Alarms & reminders" screen (the grant itself is
 * the OS's). An OEM without that screen (the native side reports false) gets the app's own
 * system-settings page instead of a dead tap.
 */
export function openExactAlarmSettingsAction(source: 'today_card' | 'settings'): void {
  track('exact_alarm_prompt', { action: 'open_settings', source });
  if (!openExactAlarmSettings()) void Linking.openSettings();
}

export function isExactAlarmPromptDismissed(): boolean {
  return appStorage.getString(StorageKeys.exactAlarmPromptDismissed) === '1';
}

export function dismissExactAlarmPrompt(): void {
  track('exact_alarm_prompt', { action: 'dismiss', source: 'today_card' });
  appStorage.set(StorageKeys.exactAlarmPromptDismissed, '1');
}
