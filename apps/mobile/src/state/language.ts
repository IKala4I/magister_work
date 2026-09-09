/**
 * Language preference — the same shape as the appearance store (File 03 §2.1: Zustand for
 * ephemeral UI only; this is presentation state, no domain data), persisted as an MMKV flag and
 * hydrated synchronously at store creation.
 *
 * The store is not what makes `t()` answer correctly — `src/i18n/locale.ts` reads the same MMKV
 * key itself, so the very first string of a cold start is already in the chosen language. The
 * store exists so that changing the choice can (a) tell the i18n layer, (b) re-render the tree,
 * and (c) record the language on the profile.
 */
import { getLocales } from 'expo-localization';
import { create } from 'zustand';

import {
  LANGUAGE_PREFERENCES,
  isLanguagePreference,
  loadPersistedLanguage,
  resolveLocale,
  setActiveLocale,
  type CatalogLocale,
  type LanguagePreference,
} from '../i18n';
import { appStorage, StorageKeys } from '../storage/mmkv';

export { LANGUAGE_PREFERENCES, type LanguagePreference };

interface LanguageState {
  preference: LanguagePreference;
  /** The catalog in force — the remount key on the root layout hangs off this. */
  locale: CatalogLocale;
  setPreference: (preference: LanguagePreference) => void;
}

function localeFor(
  preference: LanguagePreference,
  codes: readonly (string | null)[],
): CatalogLocale {
  return resolveLocale(codes, preference);
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  preference: loadPersistedLanguage(),
  locale: 'en',
  setPreference: (preference) => {
    if (!isLanguagePreference(preference) || preference === get().preference) return;
    appStorage.set(StorageKeys.language, preference);
    set({ preference });
  },
}));

/**
 * Called once at app start, before the first render: resolves the catalog from the stored
 * preference and the device, and puts it in the store so the root layout's key is right from
 * the first frame rather than after a flip.
 */
export function initLanguage(): CatalogLocale {
  return applyLanguage(
    useLanguageStore.getState().preference,
    getLocales().map((l) => l.languageCode),
  );
}

/** Re-resolves the active catalog from the current preference and the device's languages. */
export function applyLanguage(
  preference: LanguagePreference,
  codes: readonly (string | null)[],
): CatalogLocale {
  const locale = localeFor(preference, codes);
  setActiveLocale(locale);
  useLanguageStore.setState({ locale });
  return locale;
}
