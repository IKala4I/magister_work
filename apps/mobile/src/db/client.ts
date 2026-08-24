/**
 * Device database handle. `enableChangeListener` powers useLiveQuery reactivity
 * (File 03 §1.2 "single reactive source of truth"). Import only from app code —
 * opening the database is a native side effect (tests import schema, never this).
 */
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

export const sqlite = openDatabaseSync('hourwell.db', { enableChangeListener: true });

export const db = drizzle(sqlite, { schema });
