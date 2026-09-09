/**
 * Typed i18n access (decision 6). Components call `t('key')`; keys are compile-time checked
 * against the English catalog, which every other catalog must match key for key. Counted
 * sentences go through `plural()` — Ukrainian needs three integer forms where English needs two,
 * so a `count === 1` ternary at the call site is not enough.
 *
 * Which language is active, and how a device locale and an explicit choice combine, lives in
 * `./locale`; date and time rendering lives in `./format`.
 */
import { en, enPlurals, type MessageKey, type PluralKey } from './en';
import { getActiveLocale, type CatalogLocale } from './locale';
import { selectPlural, type PluralForms } from './plural';
import { uk, ukPlurals } from './uk';

export type { MessageKey, PluralKey };
export {
  CATALOG_LOCALES,
  DEFAULT_LOCALE,
  LANGUAGE_PREFERENCES,
  getActiveLocale,
  isLanguagePreference,
  loadPersistedLanguage,
  localeTag,
  resetLocaleForTests,
  resolveLocale,
  setActiveLocale,
  type CatalogLocale,
  type LanguagePreference,
} from './locale';
export { CLOCK_OPTIONS, formatDate, formatDateTime, formatTime } from './format';
export { PLURAL_FORMS, pluralForm, type PluralForm } from './plural';

interface Catalog {
  messages: Record<MessageKey, string>;
  plurals: Record<PluralKey, PluralForms>;
}

const catalogs: Record<CatalogLocale, Catalog> = {
  en: { messages: en, plurals: enPlurals },
  uk: { messages: uk, plurals: ukPlurals },
};

/** Interpolates `{name}` slots; missing params are left visible so tests catch them. */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return interpolate(catalogs[getActiveLocale()].messages[key], params);
}

/**
 * A counted sentence in the form the active language uses for `count`. `{count}` is supplied
 * automatically; pass `params` for any other slot.
 */
export function plural(
  key: PluralKey,
  count: number,
  params?: Record<string, string | number>,
): string {
  const locale = getActiveLocale();
  const template = selectPlural(catalogs[locale].plurals[key], locale, count);
  return interpolate(template, { count, ...params });
}

/** The catalogs themselves — for tests that assert parity, never for rendering. */
export const CATALOGS = catalogs;
