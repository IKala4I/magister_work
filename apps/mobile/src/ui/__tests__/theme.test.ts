/**
 * Theme resolution + appearance persistence: preference beats OS scheme, 'system' follows
 * the OS with a light fallback, and the stored flag round-trips through MMKV.
 */
import { appStorage, StorageKeys } from '../../storage/mmkv';
import {
  loadPersistedPreference,
  useAppearanceStore,
  SCHEME_PREFERENCES,
} from '../../state/appearance';
import { resolveScheme } from '../theme';

beforeEach(() => {
  appStorage.clearAll();
  useAppearanceStore.setState({ preference: 'system' });
});

describe('resolveScheme', () => {
  it('follows the OS when preference is system', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
  });

  it('falls back to light when the OS reports nothing', () => {
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', undefined)).toBe('light');
  });

  it('explicit preference overrides the OS', () => {
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
  });
});

describe('appearance store persistence', () => {
  it('persists the preference as an MMKV flag', () => {
    useAppearanceStore.getState().setPreference('dark');
    expect(appStorage.getString(StorageKeys.schemePreference)).toBe('dark');
    expect(useAppearanceStore.getState().preference).toBe('dark');
  });

  it('hydrates a persisted value', () => {
    appStorage.set(StorageKeys.schemePreference, 'light');
    expect(loadPersistedPreference()).toBe('light');
  });

  it('treats garbage in storage as system', () => {
    appStorage.set(StorageKeys.schemePreference, 'neon');
    expect(loadPersistedPreference()).toBe('system');
  });

  it('exposes exactly the three spec preferences', () => {
    expect(SCHEME_PREFERENCES).toEqual(['system', 'light', 'dark']);
  });
});
