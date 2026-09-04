/**
 * OS wiring for local notifications (FR-50/FR-26; ADR-0014 §1, §3, §5): the foreground handler,
 * the Android channels, the notification categories with their actions, and the permission
 * helpers. Local only — no push token is ever requested (ADR-0011). Imports the native module,
 * so jest mocks this file (or `expo-notifications`) wherever a screen pulls it in.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { t } from '../i18n';
import { track } from '../observability/analytics';

import { resetLedger } from './ledger';

/** Android channel ids (importance DEFAULT: a reminder, not an alarm — no guilt UI). */
export const CHANNEL_REMINDERS = 'reminders';
export const CHANNEL_RITUAL = 'ritual';
/**
 * Category id of the ritual (iOS category / Android action buttons). Block reminders carry NO
 * category: they have no actions, and Android's expo-notifications rejects a category without
 * actions ("Must provide at least one action"). Registering an empty block category FIRST used
 * to throw before the ritual's category was set, so the 20:00 ritual posted without its
 * "Plan tomorrow" / "Adjust" buttons (Pixel 7a, hardware pass 2026-09-04, FR-26).
 */
export const CATEGORY_RITUAL = 'plan_tomorrow';
/** Action identifiers on the ritual: FR-26 "one-tap accept/adjust". */
export const ACTION_ACCEPT = 'accept';
export const ACTION_ADJUST = 'adjust';

let initialized = false;

/** Idempotent; call once at app start (root layout). Never throws — notifications are optional. */
export function initNotifications(): void {
  if (initialized) return;
  initialized = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: () =>
        Promise.resolve({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
    });
  } catch {
    // no native module (web / tests) — the scheduler will find no permission and do nothing
  }
  void registerCategories();
  if (Platform.OS === 'android') void registerChannels();
}

async function registerCategories(): Promise<void> {
  try {
    // only the ritual has actions; never register a category without any (see CATEGORY_RITUAL)
    await Notifications.setNotificationCategoryAsync(CATEGORY_RITUAL, [
      {
        identifier: ACTION_ACCEPT,
        buttonTitle: t('notify.ritual.action.accept'),
        options: { opensAppToForeground: true },
      },
      {
        identifier: ACTION_ADJUST,
        buttonTitle: t('notify.ritual.action.adjust'),
        options: { opensAppToForeground: true },
      },
    ]);
  } catch {
    // categories are cosmetic; a plain tap still opens the app
  }
}

async function registerChannels(): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_REMINDERS, {
      name: t('notify.channel.reminders'),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_RITUAL, {
      name: t('notify.channel.ritual'),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    // channel creation failing only degrades to the default channel
  }
}

/** Sign-out / account switch / erasure: nothing pending, nothing remembered (ledger + OS). */
export async function clearAllNotifications(): Promise<void> {
  resetLedger();
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // no native module
  }
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

function stateOf(p: Notifications.NotificationPermissionsStatus): PermissionState {
  if (p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return 'granted';
  }
  return p.canAskAgain && p.status !== 'denied' ? 'undetermined' : 'denied';
}

/** Current OS permission; 'denied' when the native module is unavailable. */
export async function getPermissionState(): Promise<PermissionState> {
  try {
    return stateOf(await Notifications.getPermissionsAsync());
  } catch {
    return 'denied';
  }
}

/** Ask the OS once (alerts + sound, no badge); records the outcome (categorical). */
export async function requestPermission(
  source: 'today_card' | 'settings',
): Promise<PermissionState> {
  let state: PermissionState;
  try {
    state = stateOf(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      }),
    );
  } catch {
    state = 'denied';
  }
  track('reminders_permission', { granted: state === 'granted', source });
  return state;
}
