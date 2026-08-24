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
} as const;
