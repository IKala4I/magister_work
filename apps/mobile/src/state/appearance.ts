/**
 * Appearance preference — ephemeral-UI Zustand store (File 03 §2.1: Zustand for ephemeral
 * UI only; this is presentation state, no domain data). Persisted as an MMKV flag so the
 * choice survives restarts; hydrated synchronously at store creation.
 */
import { create } from 'zustand';

import { appStorage, StorageKeys } from '../storage/mmkv';

export const SCHEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type SchemePreference = (typeof SCHEME_PREFERENCES)[number];

function isSchemePreference(value: string | undefined): value is SchemePreference {
  return value !== undefined && (SCHEME_PREFERENCES as readonly string[]).includes(value);
}

export function loadPersistedPreference(): SchemePreference {
  const stored = appStorage.getString(StorageKeys.schemePreference);
  return isSchemePreference(stored) ? stored : 'system';
}

interface AppearanceState {
  preference: SchemePreference;
  setPreference: (preference: SchemePreference) => void;
}

export const useAppearanceStore = create<AppearanceState>((set) => ({
  preference: loadPersistedPreference(),
  setPreference: (preference) => {
    appStorage.set(StorageKeys.schemePreference, preference);
    set({ preference });
  },
}));
