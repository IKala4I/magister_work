/**
 * Pre-auth identity (P3): auth arrives in P4 (FR-01 — anonymous trial from first launch),
 * but tasks must work fully offline before that. Local rows are owned by a device-derived
 * placeholder id. Nothing is pushed before P8, so no placeholder ever reaches the server.
 *
 * Binding contract for P4: on first sign-in (anonymous included), rewrite every row whose
 * user_id isLocalUserId() to the authenticated user id BEFORE any push, then follow the
 * cursor contract in src/sync/cursor.ts for later account *changes* (reset + mirror wipe).
 */
import { getDeviceId } from './opId';

export const LOCAL_USER_PREFIX = 'local:';

export function getLocalUserId(): string {
  return LOCAL_USER_PREFIX + getDeviceId();
}

export function isLocalUserId(userId: string): boolean {
  return userId.startsWith(LOCAL_USER_PREFIX);
}
