/**
 * ADR-0023: changing the interface language. One user-visible action with four consequences —
 * the choice is persisted, the i18n layer is told, the profile records the language the person
 * actually reads, and the OS-side copy (notification categories, Android channel names, any
 * pending notification bodies) is re-rendered.
 *
 * The re-render of the app itself is not done here: the root layout keys off the store's locale
 * (see `app/_layout.tsx`), which is how 378 `t()` call sites change language without one of them
 * becoming a hook.
 */
import { getLocales } from 'expo-localization';

import { currentUserId } from '../auth/identity';
import { db } from '../db/client';
import { updateProfileLocale } from '../db/profile';
import type { LocalDb } from '../db/writes';
import type { LanguagePreference } from '../i18n';
import { runNotificationScheduler } from '../notifications/scheduler';
import { reRegisterNotificationCopy } from '../notifications/setup';
import { track } from '../observability/analytics';
import { applyLanguage, useLanguageStore } from '../state/language';
import { scheduleSync } from '../sync/engine';

const localDb = db as unknown as LocalDb;

/** Applies a language choice everywhere it is visible. Safe to call with the current choice. */
export function changeLanguageAction(preference: LanguagePreference): void {
  const before = useLanguageStore.getState().locale;
  useLanguageStore.getState().setPreference(preference);
  const locale = applyLanguage(
    preference,
    getLocales().map((l) => l.languageCode),
  );
  if (locale === before) return;

  try {
    updateProfileLocale(localDb, { userId: currentUserId(), locale });
    scheduleSync('write');
  } catch {
    // No session or no profile row yet (the welcome screen): MMKV already holds the choice, and
    // onboarding writes the locale when it creates the row.
  }
  void reRegisterNotificationCopy();
  void runNotificationScheduler();
  track('language_changed', { locale });
}
