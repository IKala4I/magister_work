/**
 * Session storage for supabase-js: the official Supabase Expo "LargeSecureStore" pattern
 * (expo-secure-store caps values at 2048 bytes, sessions exceed it), with MMKV holding the
 * ciphertext instead of adding AsyncStorage — the secret material (a per-key AES-256 key)
 * lives only in the device keychain/keystore via expo-secure-store, so the CLAUDE.md pin
 * "session in expo-secure-store" holds: MMKV stores bytes that are useless without it.
 * AES-CTR matches the documented pattern; a fresh key is generated on every write.
 */
import 'react-native-get-random-values';
import * as aesjs from 'aes-js';
import * as SecureStore from 'expo-secure-store';

import { appStorage, StorageKeys } from '../storage/mmkv';

/** SecureStore keys must be [A-Za-z0-9._-]; supabase keys (sb-…-auth-token) already are. */
const ciphertextKey = (key: string) => StorageKeys.sessionCiphertextPrefix + key;

export const largeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    // Any storage corruption must read as "no session" (null) — never a throw inside
    // supabase auth init, never garbage: a crash between the key write and the ciphertext
    // write leaves a fresh key over old ciphertext, which CTR happily "decrypts" to noise
    // (finding m9). Sessions are JSON, so a parse check rejects that noise.
    try {
      const ciphertextHex = appStorage.getString(ciphertextKey(key));
      if (ciphertextHex == null) return null;
      const keyHex = await SecureStore.getItemAsync(key);
      if (keyHex == null) return null; // key lost (reinstall) — session is unrecoverable
      const cipher = new aesjs.ModeOfOperation.ctr(
        aesjs.utils.hex.toBytes(keyHex),
        new aesjs.Counter(1),
      );
      const plaintext = aesjs.utils.utf8.fromBytes(
        cipher.decrypt(aesjs.utils.hex.toBytes(ciphertextHex)),
      );
      JSON.parse(plaintext);
      return plaintext;
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const ciphertext = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    // Key first: a ciphertext without its key is unreadable, the reverse is a dangling key.
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    appStorage.set(ciphertextKey(key), aesjs.utils.hex.fromBytes(ciphertext));
  },

  async removeItem(key: string): Promise<void> {
    appStorage.delete(ciphertextKey(key));
    await SecureStore.deleteItemAsync(key);
  },
};
