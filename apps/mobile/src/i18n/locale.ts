/**
 * Which language the app renders in, and how that answer is reached.
 *
 * Two inputs: the OS locale list (expo-localization) and the user's explicit choice, persisted
 * as an MMKV flag exactly like the appearance preference. `system` follows the phone; an explicit
 * choice wins over it. The preference is read straight from storage rather than injected, so the
 * first `t()` of a cold start already renders in the chosen language — there is no window in which
 * the app is briefly English because a store had not mounted yet.
 */
import { getLocales } from 'expo-localization';

import { appStorage, StorageKeys } from '../storage/mmkv';

/** Locales with a catalog. Adding one here is a type error until its catalog exists. */
export const CATALOG_LOCALES = ['en', 'uk'] as const;
export type CatalogLocale = (typeof CATALOG_LOCALES)[number];

export const LANGUAGE_PREFERENCES = ['system', 'en', 'uk'] as const;
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

export const DEFAULT_LOCALE: CatalogLocale = 'en';

function isCatalogLocale(value: string | null | undefined): value is CatalogLocale {
  return (
    value !== null && value !== undefined && (CATALOG_LOCALES as readonly string[]).includes(value)
  );
}

export function isLanguagePreference(value: string | undefined): value is LanguagePreference {
  return value !== undefined && (LANGUAGE_PREFERENCES as readonly string[]).includes(value);
}

/** The stored choice, or `system` when nothing was ever chosen. */
export function loadPersistedLanguage(): LanguagePreference {
  const stored = appStorage.getString(StorageKeys.language);
  return isLanguagePreference(stored) ? stored : 'system';
}

/**
 * The catalog to render in. An explicit preference wins; `system` takes the first OS language
 * that has a catalog; English is the fallback for every other language.
 *
 * The code is compared on its language subtag, so a platform that reports a region-tagged
 * `uk-UA` (or a script-tagged `sr-Latn`) still finds its catalog.
 */
export function resolveLocale(
  languageCodes: readonly (string | null)[],
  preference: LanguagePreference = 'system',
): CatalogLocale {
  if (preference !== 'system') return preference;
  for (const code of languageCodes) {
    const language = code?.toLowerCase().split(/[-_]/)[0] ?? null;
    if (isCatalogLocale(language)) return language;
  }
  return DEFAULT_LOCALE;
}

let activeLocale: CatalogLocale | null = null;

export function getActiveLocale(): CatalogLocale {
  if (activeLocale === null) {
    activeLocale = resolveLocale(
      getLocales().map((l) => l.languageCode),
      loadPersistedLanguage(),
    );
  }
  return activeLocale;
}

/** Called by the language store after it persists a new choice. */
export function setActiveLocale(locale: CatalogLocale): void {
  activeLocale = locale;
  memoizedTag = null;
}

/**
 * The BCP 47 tag for `Intl` formatting: the language comes from the active catalog, the
 * regional conventions (hour cycle, date order) from the phone. When the phone already speaks
 * the active language its own tag is used verbatim, so a Ukrainian phone keeps `uk-UA` and a
 * US phone keeps `en-US`. Otherwise the language's own default: `uk-UA`, or `en-GB` for English
 * — the app writes its own times in 24-hour form, and `en-US` would print 12-hour clocks beside
 * them on a phone that never asked for them.
 */
let memoizedTag: string | null = null;

export function localeTag(): string {
  if (memoizedTag !== null) return memoizedTag;
  const active = getActiveLocale();
  const fallback = active === 'uk' ? 'uk-UA' : 'en-GB';
  // `getLocales()` is a native call, and this runs for every date and clock time in a list; the
  // answer only changes when the app is relaunched or the language is switched.
  const device = getLocales()[0];
  const tag =
    device?.languageCode?.toLowerCase().split(/[-_]/)[0] === active && device.languageTag
      ? device.languageTag
      : fallback;
  // An OEM ROM can report a malformed tag (`uk_UA`), and `Intl` throws a RangeError on it during
  // render — a white screen where the old `toLocale*(undefined, …)` merely used the OS default.
  try {
    new Intl.DateTimeFormat(tag);
    memoizedTag = tag;
  } catch {
    memoizedTag = fallback;
  }
  return memoizedTag;
}

/** Test seam: forget the memoized locale so the next read re-resolves from OS + preference. */
export function resetLocaleForTests(): void {
  activeLocale = null;
  memoizedTag = null;
}
