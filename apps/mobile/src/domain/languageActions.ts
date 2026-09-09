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
import { getActiveLocale, type CatalogLocale, type LanguagePreference } from '../i18n';
import { runNotificationScheduler } from '../notifications/scheduler';
import { reRegisterNotificationCopy } from '../notifications/setup';
import { track } from '../observability/analytics';
import { Sentry } from '../observability/sentry';
import { applyLanguage, useLanguageStore } from '../state/language';
import { scheduleSync } from '../sync/engine';

const localDb = db as unknown as LocalDb;

/** Applies a language choice everywhere it is visible. Safe to call with the current choice. */
export function changeLanguageAction(preference: LanguagePreference): void {
  // `getActiveLocale()` rather than the store's copy: the store is the render-side mirror and
  // starts at 'en' until `initLanguage()` runs, so reading it here would make the comparison
  // depend on mount order.
  const before = getActiveLocale();
  useLanguageStore.getState().setPreference(preference);
  const locale = applyLanguage(
    preference,
    getLocales().map((l) => l.languageCode),
  );

  // Outside the early return below: the row can be stale even when the rendered language does not
  // change — an account that onboarded on an English phone and later followed the system into
  // Ukrainian never crossed this function until now.
  recordLocaleOnProfile(locale);
  if (locale === before) return;

  void reRegisterNotificationCopy();
  void runNotificationScheduler();
  track('language_changed', { locale });
}

/**
 * Records the language actually being read on the profile row. Absent session or row is the
 * ordinary case on the welcome screen and is ignored; anything else is a real write failure and
 * is reported rather than swallowed, because a silent one leaves the row disagreeing with the
 * screen forever.
 */
function recordLocaleOnProfile(locale: CatalogLocale): void {
  let userId: string;
  try {
    userId = currentUserId();
  } catch {
    return; // no session yet — onboarding writes the locale when it creates the row
  }
  try {
    if (updateProfileLocale(localDb, { userId, locale }) === undefined) return; // no row yet
    scheduleSync('write');
  } catch (error) {
    Sentry.captureException(error);
  }
}
