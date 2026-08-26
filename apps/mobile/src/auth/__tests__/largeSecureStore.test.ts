/**
 * Session storage adapter (NFR-S1): the AES key must live in expo-secure-store, the
 * ciphertext in MMKV, and losing either side must yield null (never garbage or a throw).
 */
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    setItemAsync: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((k: string) => {
      store.delete(k);
      return Promise.resolve();
    }),
    __store: store,
  };
});
jest.mock('react-native-get-random-values', () => ({}));

import * as SecureStore from 'expo-secure-store';

import { appStorage, StorageKeys } from '../../storage/mmkv';
import { largeSecureStore } from '../largeSecureStore';

const KEY = 'sb-test-auth-token';
const SESSION = JSON.stringify({ access_token: 'x'.repeat(3000), user: { id: 'u1' } });

beforeEach(() => {
  appStorage.clearAll();
  (SecureStore as unknown as { __store: Map<string, string> }).__store.clear();
});

describe('largeSecureStore', () => {
  it('round-trips values larger than the 2048-byte SecureStore cap', async () => {
    await largeSecureStore.setItem(KEY, SESSION);
    expect(SESSION.length).toBeGreaterThan(2048);
    await expect(largeSecureStore.getItem(KEY)).resolves.toBe(SESSION);
  });

  it('keeps the plaintext out of MMKV (only ciphertext + key handle exist)', async () => {
    await largeSecureStore.setItem(KEY, SESSION);
    const stored = appStorage.getString(StorageKeys.sessionCiphertextPrefix + KEY);
    expect(stored).toBeDefined();
    expect(stored).not.toContain('access_token');
    // the AES key is in SecureStore, not MMKV
    expect(await SecureStore.getItemAsync(KEY)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns null for unknown keys and after removal', async () => {
    await expect(largeSecureStore.getItem(KEY)).resolves.toBeNull();
    await largeSecureStore.setItem(KEY, SESSION);
    await largeSecureStore.removeItem(KEY);
    await expect(largeSecureStore.getItem(KEY)).resolves.toBeNull();
    expect(appStorage.getString(StorageKeys.sessionCiphertextPrefix + KEY)).toBeUndefined();
    expect(await SecureStore.getItemAsync(KEY)).toBeNull();
  });

  it('a lost SecureStore key yields null, not garbage (reinstall semantics)', async () => {
    await largeSecureStore.setItem(KEY, SESSION);
    await SecureStore.deleteItemAsync(KEY);
    await expect(largeSecureStore.getItem(KEY)).resolves.toBeNull();
  });
});
