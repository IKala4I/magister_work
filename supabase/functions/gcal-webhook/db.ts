/**
 * Supabase adapters for the Google Calendar functions (SERVICE-ROLE client throughout:
 * `gcal_sync_state` and `calendar_events` are server-authored, specs/07 §4.4). Shared by
 * `gcal-webhook`, `gcal-connect` and `gcal-callback`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MappedEvent } from '../_shared/gcal.ts';
import type { GcalState, OpenRec, SyncDeps, WriteBackRec } from '../_shared/gcal_sync.ts';

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

function fail(step: string, error: { message: string } | null): never {
  throw new Error(`${step}: ${error?.message ?? 'unknown error'}`);
}

const STATE_SELECT =
  'user_id, calendar_id, refresh_token, access_token, access_token_expires_at, sync_token, channel_id, resource_id, channel_token, channel_expires_at, scope, write_back, last_synced_at, last_error, connected_at, confirmed_at, confirm_token, confirm_token_expires_at, oauth_state, oauth_state_expires_at';

// deno-lint-ignore no-explicit-any
function toState(r: any, timezone: string): GcalState {
  return {
    user_id: r.user_id,
    calendar_id: r.calendar_id ?? 'primary',
    refresh_token: r.refresh_token ?? null,
    access_token: r.access_token ?? null,
    access_token_expires_at: r.access_token_expires_at ?? null,
    sync_token: r.sync_token ?? null,
    channel_id: r.channel_id ?? null,
    resource_id: r.resource_id ?? null,
    channel_token: r.channel_token ?? null,
    channel_expires_at: r.channel_expires_at ?? null,
    scope: r.scope === 'write' ? 'write' : 'read',
    write_back: Boolean(r.write_back),
    last_synced_at: r.last_synced_at ?? null,
    last_error: r.last_error ?? null,
    connected_at: r.connected_at ?? null,
    confirmed_at: r.confirmed_at ?? null,
    confirm_token: r.confirm_token ?? null,
    confirm_token_expires_at: r.confirm_token_expires_at ?? null,
    oauth_state: r.oauth_state ?? null,
    oauth_state_expires_at: r.oauth_state_expires_at ?? null,
    timezone,
  };
}

/**
 * gcal_sync_state has no FK to profiles (both hang off auth.users), so PostgREST cannot embed
 * the zone: read the profiles of the rows' users in one query instead.
 */
// deno-lint-ignore no-explicit-any
async function withTimezones(admin: AnyClient, rows: any[]): Promise<GcalState[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r.user_id as string))];
  const { data, error } = await admin.from('profiles').select('user_id, timezone').in(
    'user_id',
    ids,
  );
  if (error) fail('profiles for gcal state', error);
  const tz = new Map((data ?? []).map((p) => [p.user_id as string, p.timezone as string]));
  return rows.map((r) => toState(r, tz.get(r.user_id) ?? 'UTC'));
}

export async function loadState(admin: AnyClient, userId: string): Promise<GcalState | null> {
  const { data, error } = await admin
    .from('gcal_sync_state')
    .select(STATE_SELECT)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) fail('gcal_sync_state', error);
  return data === null ? null : (await withTimezones(admin, [data]))[0] ?? null;
}

export async function loadStateByChannel(
  admin: AnyClient,
  channelId: string,
): Promise<GcalState | null> {
  const { data, error } = await admin
    .from('gcal_sync_state')
    .select(STATE_SELECT)
    .eq('channel_id', channelId)
    .maybeSingle();
  if (error) fail('gcal_sync_state by channel', error);
  return data === null ? null : (await withTimezones(admin, [data]))[0] ?? null;
}

export async function loadStateByNonce(
  admin: AnyClient,
  nonce: string,
): Promise<GcalState | null> {
  const { data, error } = await admin
    .from('gcal_sync_state')
    .select(STATE_SELECT)
    .eq('oauth_state', nonce)
    .maybeSingle();
  if (error) fail('gcal_sync_state by nonce', error);
  return data === null ? null : (await withTimezones(admin, [data]))[0] ?? null;
}

export async function loadStateByConfirmToken(
  admin: AnyClient,
  token: string,
): Promise<GcalState | null> {
  const { data, error } = await admin
    .from('gcal_sync_state')
    .select(STATE_SELECT)
    .eq('confirm_token', token)
    .maybeSingle();
  if (error) fail('gcal_sync_state by confirm token', error);
  return data === null ? null : (await withTimezones(admin, [data]))[0] ?? null;
}

/** Every connected calendar (a refresh token exists AND the device confirmed the consent). */
export async function loadConnected(admin: AnyClient, limit = 500): Promise<GcalState[]> {
  const { data, error } = await admin
    .from('gcal_sync_state')
    .select(STATE_SELECT)
    .not('refresh_token', 'is', null)
    .not('confirmed_at', 'is', null)
    .limit(limit);
  if (error) fail('gcal_sync_state connected', error);
  return withTimezones(admin, data ?? []);
}

export async function saveState(
  admin: AnyClient,
  userId: string,
  patch: Partial<GcalState>,
): Promise<void> {
  const { timezone: _tz, user_id: _u, ...fields } = patch;
  const { error } = await admin
    .from('gcal_sync_state')
    .upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() }, {
      onConflict: 'user_id',
    });
  if (error) fail('gcal_sync_state upsert', error);
}

export async function deleteState(admin: AnyClient, userId: string): Promise<void> {
  const { error } = await admin.from('gcal_sync_state').delete().eq('user_id', userId);
  if (error) fail('gcal_sync_state delete', error);
}

export async function upsertEvents(
  admin: AnyClient,
  userId: string,
  events: readonly MappedEvent[],
): Promise<void> {
  const nowIso = new Date().toISOString();
  const live = events.filter((e) => !e.deleted);
  if (live.length > 0) {
    // PostgREST bulk upserts null-fill missing keys: send every column
    const { error } = await admin.from('calendar_events').upsert(
      live.map((e) => ({
        user_id: userId,
        source: 'google',
        external_id: e.external_id,
        start_at: e.start_at,
        end_at: e.end_at,
        title: e.title,
        busy: e.busy,
        deleted_at: null,
        updated_at: nowIso,
      })),
      { onConflict: 'user_id,source,external_id' },
    );
    if (error) fail('calendar_events upsert', error);
  }
  const gone = events.filter((e) => e.deleted).map((e) => e.external_id);
  if (gone.length > 0) {
    const { error } = await admin
      .from('calendar_events')
      .update({ deleted_at: nowIso, busy: false, updated_at: nowIso })
      .eq('user_id', userId)
      .eq('source', 'google')
      .in('external_id', gone)
      .is('deleted_at', null);
    if (error) fail('calendar_events tombstone', error);
  }
}

export async function wipeEvents(admin: AnyClient, userId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from('calendar_events')
    .update({ deleted_at: nowIso, busy: false, updated_at: nowIso })
    .eq('user_id', userId)
    .eq('source', 'google')
    .is('deleted_at', null);
  if (error) fail('calendar_events wipe', error);
}

export async function loadOpenRecs(
  admin: AnyClient,
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<OpenRec[]> {
  const { data, error } = await admin
    .from('recommendations')
    .select('id, slot_start, slot_end, status')
    .eq('user_id', userId)
    .in('status', ['shown', 'accepted', 'pinned', 'moved'])
    .gt('slot_end', fromIso)
    .lt('slot_start', toIso);
  if (error) fail('recommendations open', error);
  return (data ?? []) as OpenRec[];
}

export async function markDisplaced(
  admin: AnyClient,
  userId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin
    .from('recommendations')
    .update({ status: 'displaced_pending', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('id', [...ids])
    .in('status', ['shown', 'accepted', 'pinned', 'moved']);
  if (error) fail('recommendations displace', error);
}

export async function loadWriteBackRecs(
  admin: AnyClient,
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<WriteBackRec[]> {
  const { data, error } = await admin
    .from('recommendations')
    .select(
      'id, slot_start, slot_end, status, gcal_event_id, gcal_synced_slot_start, tasks!inner(title)',
    )
    .eq('user_id', userId)
    .gte('slot_end', fromIso)
    .lte('slot_start', toIso);
  if (error) fail('recommendations write-back', error);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    slot_start: r.slot_start,
    slot_end: r.slot_end,
    status: r.status,
    gcal_event_id: r.gcal_event_id ?? null,
    gcal_synced_slot_start: r.gcal_synced_slot_start ?? null,
    title: (Array.isArray(r.tasks) ? r.tasks[0]?.title : r.tasks?.title) ?? '',
  }));
}

export async function loadWriteBackMirrored(
  admin: AnyClient,
  userId: string,
): Promise<WriteBackRec[]> {
  const { data, error } = await admin
    .from('recommendations')
    .select('id, slot_start, slot_end, status, gcal_event_id, gcal_synced_slot_start')
    .eq('user_id', userId)
    .not('gcal_event_id', 'is', null);
  if (error) fail('recommendations mirrored', error);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    slot_start: r.slot_start,
    slot_end: r.slot_end,
    status: r.status,
    gcal_event_id: r.gcal_event_id ?? null,
    gcal_synced_slot_start: r.gcal_synced_slot_start ?? null,
    title: '',
  }));
}

export async function saveWriteBack(
  admin: AnyClient,
  userId: string,
  recId: string,
  patch: { gcal_event_id: string | null; gcal_synced_slot_start: string | null },
): Promise<void> {
  const { error } = await admin
    .from('recommendations')
    .update(patch)
    .eq('user_id', userId)
    .eq('id', recId);
  if (error) fail('recommendations write-back save', error);
}

/** Everything `_shared/gcal_sync.ts` needs, bound to the admin client. */
export function makeSyncDbDeps(
  admin: AnyClient,
): Pick<
  SyncDeps,
  | 'saveState'
  | 'upsertEvents'
  | 'wipeEvents'
  | 'loadOpenRecs'
  | 'markDisplaced'
  | 'loadWriteBackRecs'
  | 'loadWriteBackMirrored'
  | 'saveWriteBack'
> {
  return {
    saveState: (userId, patch) => saveState(admin, userId, patch),
    upsertEvents: (userId, events) => upsertEvents(admin, userId, events),
    wipeEvents: (userId) => wipeEvents(admin, userId),
    loadOpenRecs: (userId, from, to) => loadOpenRecs(admin, userId, from, to),
    markDisplaced: (userId, ids) => markDisplaced(admin, userId, ids),
    loadWriteBackRecs: (userId, from, to) => loadWriteBackRecs(admin, userId, from, to),
    loadWriteBackMirrored: (userId) => loadWriteBackMirrored(admin, userId),
    saveWriteBack: (userId, recId, patch) => saveWriteBack(admin, userId, recId, patch),
  };
}
