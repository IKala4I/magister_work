/**
 * UI-facing P10 notification actions: the settings write (profile row + `profile_update` op
 * through the outbox), the debounced sync, the categorical analytics mirror, and a scheduler
 * re-run so the OS reflects the new preference at once. Imports the device database, so
 * component tests mock this module (same shape as insightsActions.ts).
 */
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
import { appStorage, StorageKeys } from '../storage/mmkv';
import { scheduleSync } from '../sync/engine';

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
