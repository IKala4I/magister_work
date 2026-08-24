/**
 * Typed i18n access (decision 6). Components call `t('key')`; keys are compile-time
 * checked against the catalog. Locale is resolved once from the OS (expo-localization);
 * only English ships until another catalog file lands.
 */
import { getLocales } from 'expo-localization';

import { en, type MessageKey } from './en';

export type { MessageKey };

const catalogs = { en } as const;
export type CatalogLocale = keyof typeof catalogs;

/** First OS locale whose language tag has a catalog; falls back to English. */
export function resolveLocale(languageCodes: readonly (string | null)[]): CatalogLocale {
  for (const code of languageCodes) {
    if (code !== null && code.toLowerCase() in catalogs) {
      return code.toLowerCase() as CatalogLocale;
    }
  }
  return 'en';
}

let activeLocale: CatalogLocale | null = null;

function currentCatalog(): typeof en {
  if (activeLocale === null) {
    activeLocale = resolveLocale(getLocales().map((l) => l.languageCode));
  }
  return catalogs[activeLocale];
}

/** Interpolates `{name}` slots; missing params are left visible so tests catch them. */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return interpolate(currentCatalog()[key], params);
}

/** Test seam: reset the memoized locale (OS locale never changes mid-process on device). */
export function resetLocaleForTests(): void {
  activeLocale = null;
}
