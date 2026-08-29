/**
 * The single MMKV instance (File 03 stack: "MMKV — sync cursor, flags"). Domain data never
 * lives here — SQLite/Drizzle is the single reactive source of truth; MMKV holds only the
 * pull cursor, device identity, op counter, and UI flags.
 */
import { MMKV } from 'react-native-mmkv';

export const appStorage = new MMKV({ id: 'hourwell' });

/** Central key registry so collisions are impossible to miss in review. */
export const StorageKeys = {
  syncCursor: 'sync.cursor.serverSeq',
  deviceId: 'sync.deviceId',
  opCounter: 'sync.opCounter',
  schemePreference: 'ui.schemePreference',
  /** Last authenticated uid — drives the account-change wipe contract (src/auth). */
  lastUserId: 'auth.lastUserId',
  /** Epoch ms of the last completed sync round trip (P8). */
  lastSyncAt: 'sync.lastSyncAt',
  /** A previous account's uid whose unacked changes are still on this device (ADR-0012 §11). */
  pendingWipeUserId: 'sync.pendingWipeUserId',
  /**
   * Prefix for supabase session ciphertext (AES-256-CTR; key material lives in
   * expo-secure-store, never here — src/auth/largeSecureStore.ts).
   */
  sessionCiphertextPrefix: 'auth.session.',
} as const;
