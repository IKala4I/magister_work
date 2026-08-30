/**
 * Google Calendar sync core shared by `gcal-webhook` (push + sweep) and `gcal-callback` (initial
 * sync): token refresh, incremental sync with the 410 full-resync rule, busy import into
 * `calendar_events`, DISPLACEMENT of open blocks (M-02 `displaced_pending` — the state File 05
 * §2 needs because the device may still hold facts), push-channel renewal, and the FR-03 opt-in
 * write-back. Dependency-injected: the handlers' tests run it against a fake Google + fake DB.
 */
import {
  type EventsPage,
  type GoogleConfig,
  HOURWELL_MARKER,
  mapGoogleEvent,
  type MappedEvent,
  overlaps,
  type TokenSet,
  type WatchResult,
  type WriteBackEvent,
} from './gcal.ts';
import { localMidnightUtcMs, wallClock } from './grid.ts';

export interface GcalState {
  user_id: string;
  calendar_id: string;
  refresh_token: string | null;
  access_token: string | null;
  access_token_expires_at: string | null;
  sync_token: string | null;
  channel_id: string | null;
  resource_id: string | null;
  channel_token: string | null;
  channel_expires_at: string | null;
  scope: 'read' | 'write';
  write_back: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  connected_at: string | null;
  /** Set by `gcal-connect {confirm}` from the device that started the consent (adversarial #10). */
  confirmed_at: string | null;
  confirm_token: string | null;
  confirm_token_expires_at: string | null;
  oauth_state: string | null;
  oauth_state_expires_at: string | null;
  /** Profile zone (all-day conversions, write-back window). */
  timezone: string;
}

export interface OpenRec {
  id: string;
  slot_start: string;
  slot_end: string;
  status: string;
}

export interface WriteBackRec extends OpenRec {
  title: string;
  gcal_event_id: string | null;
  gcal_synced_slot_start: string | null;
}

/** The subset of `gcal.ts` the core needs — injectable. */
export interface GoogleClient {
  refreshAccessToken(cfg: GoogleConfig, refreshToken: string): Promise<TokenSet>;
  listEvents(
    accessToken: string,
    calendarId: string,
    params: { syncToken?: string; timeMin?: string; timeMax?: string; pageToken?: string },
  ): Promise<EventsPage | 'gone'>;
  watchEvents(
    accessToken: string,
    calendarId: string,
    input: { channelId: string; token: string; address: string; ttlSeconds?: number },
  ): Promise<WatchResult>;
  stopChannel(accessToken: string, input: { channelId: string; resourceId: string }): Promise<void>;
  insertEvent(accessToken: string, calendarId: string, e: WriteBackEvent): Promise<string>;
  patchEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    e: WriteBackEvent,
  ): Promise<void>;
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
}

export interface SyncDeps {
  now(): number;
  config: GoogleConfig;
  google: GoogleClient;
  saveState(userId: string, patch: Partial<GcalState>): Promise<void>;
  /** Upsert by (user, source, external_id); `deleted` rows become tombstones. */
  upsertEvents(userId: string, events: readonly MappedEvent[]): Promise<void>;
  /** Tombstone every mirrored event (410 full resync, disconnect). */
  wipeEvents(userId: string): Promise<void>;
  /** Open placements ({shown, accepted, pinned, moved}) intersecting [from, to). */
  loadOpenRecs(userId: string, fromIso: string, toIso: string): Promise<OpenRec[]>;
  markDisplaced(userId: string, ids: readonly string[]): Promise<void>;
  /** Placements of the write-back window with their task titles and mirror state. */
  loadWriteBackRecs(userId: string, fromIso: string, toIso: string): Promise<WriteBackRec[]>;
  /** Every placement that still has a Google event id (cleanup on disconnect / write-back off). */
  loadWriteBackMirrored(userId: string): Promise<WriteBackRec[]>;
  saveWriteBack(
    userId: string,
    recId: string,
    patch: { gcal_event_id: string | null; gcal_synced_slot_start: string | null },
  ): Promise<void>;
  randomId(): string;
}

export const OPEN_STATUSES: ReadonlySet<string> = new Set(['shown', 'accepted', 'pinned', 'moved']);
/**
 * Initial full sync: `timeMin` = yesterday and NO `timeMax` — Google's sync token carries the
 * initial request's restrictions, so an upper bound would silently cut the incremental feed at
 * that date (adversarial #2; Google's own sample restricts by timeMin only).
 */
export const FULL_SYNC_PAST_DAYS = 1;
/** Renew a push channel when less than this remains (the sweep runs every 5 min). */
export const CHANNEL_RENEW_BEFORE_MS = 24 * 3_600_000;
/** Refresh the access token when it expires within this margin. */
const TOKEN_MARGIN_MS = 60_000;
const DAY_MS = 86_400_000;

export interface SyncReport {
  events: number;
  tombstones: number;
  displaced: number;
  full: boolean;
}

export async function ensureAccessToken(deps: SyncDeps, state: GcalState): Promise<string> {
  const nowMs = deps.now();
  const exp = state.access_token_expires_at === null
    ? 0
    : Date.parse(state.access_token_expires_at);
  if (state.access_token !== null && exp - TOKEN_MARGIN_MS > nowMs) return state.access_token;
  if (state.refresh_token === null) throw new Error('not connected (no refresh token)');
  const t = await deps.google.refreshAccessToken(deps.config, state.refresh_token);
  const expiresAt = new Date(nowMs + t.expires_in * 1000).toISOString();
  state.access_token = t.access_token;
  state.access_token_expires_at = expiresAt;
  await deps.saveState(state.user_id, {
    access_token: t.access_token,
    access_token_expires_at: expiresAt,
  });
  return t.access_token;
}

async function listAll(
  deps: SyncDeps,
  token: string,
  state: GcalState,
  syncToken: string | null,
): Promise<{ items: EventsPage['items']; nextSyncToken: string | null; tz: string } | 'gone'> {
  const nowMs = deps.now();
  const items: EventsPage['items'] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  let tz = state.timezone;
  for (let guard = 0; guard < 50; guard++) {
    const page = await deps.google.listEvents(token, state.calendar_id, {
      ...(syncToken === null
        ? { timeMin: new Date(nowMs - FULL_SYNC_PAST_DAYS * DAY_MS).toISOString() }
        : { syncToken }),
      ...(pageToken === undefined ? {} : { pageToken }),
    });
    if (page === 'gone') return 'gone';
    items.push(...page.items);
    if (typeof page.timeZone === 'string' && page.timeZone.length > 0) tz = page.timeZone;
    if (page.nextPageToken !== undefined && page.nextPageToken.length > 0) {
      pageToken = page.nextPageToken;
      continue;
    }
    nextSyncToken = page.nextSyncToken ?? null;
    break;
  }
  return { items, nextSyncToken, tz };
}

/**
 * Incremental sync (full on first run or after a 410), busy import, displacement of open blocks
 * overlapping a BUSY imported interval that ends in the future (past slots are facts, not plans).
 */
export async function syncUser(deps: SyncDeps, state: GcalState): Promise<SyncReport> {
  const nowMs = deps.now();
  const token = await ensureAccessToken(deps, state);
  let full = state.sync_token === null;
  let listed = await listAll(deps, token, state, state.sync_token);
  if (listed === 'gone') {
    // the sync token expired: wipe the mirror and start over (Google's rule)
    await deps.wipeEvents(state.user_id);
    full = true;
    listed = await listAll(deps, token, state, null);
    if (listed === 'gone') throw new Error('events.list: 410 on a full sync');
  }
  const mapped: MappedEvent[] = [];
  for (const e of listed.items) {
    const m = mapGoogleEvent(e, listed.tz);
    if (m !== null) mapped.push(m);
  }
  if (mapped.length > 0) await deps.upsertEvents(state.user_id, mapped);

  const busy = mapped.filter((m) => m.busy && !m.deleted && Date.parse(m.end_at) > nowMs);
  let displaced = 0;
  if (busy.length > 0) {
    const toMs = Math.max(...busy.map((b) => Date.parse(b.end_at)));
    const open = await deps.loadOpenRecs(
      state.user_id,
      new Date(nowMs).toISOString(),
      new Date(toMs).toISOString(),
    );
    const ids = open
      .filter((r) => OPEN_STATUSES.has(r.status) && Date.parse(r.slot_end) > nowMs)
      .filter((r) =>
        busy.some((b) =>
          overlaps(
            Date.parse(r.slot_start),
            Date.parse(r.slot_end),
            Date.parse(b.start_at),
            Date.parse(b.end_at),
          )
        )
      )
      .map((r) => r.id);
    if (ids.length > 0) {
      await deps.markDisplaced(state.user_id, ids);
      displaced = ids.length;
    }
  }
  const nowIso = new Date(nowMs).toISOString();
  state.sync_token = listed.nextSyncToken;
  state.last_synced_at = nowIso;
  await deps.saveState(state.user_id, {
    sync_token: listed.nextSyncToken,
    last_synced_at: nowIso,
    last_error: null,
  });
  return {
    events: mapped.filter((m) => !m.deleted).length,
    tombstones: mapped.filter((m) => m.deleted).length,
    displaced,
    full,
  };
}

/** Open (or renew, when < 24 h remain) the push channel. Returns true when a channel was created. */
export async function ensureChannel(deps: SyncDeps, state: GcalState): Promise<boolean> {
  const nowMs = deps.now();
  const exp = state.channel_expires_at === null ? 0 : Date.parse(state.channel_expires_at);
  if (state.channel_id !== null && exp - CHANNEL_RENEW_BEFORE_MS > nowMs) return false;
  const token = await ensureAccessToken(deps, state);
  if (state.channel_id !== null && state.resource_id !== null) {
    try {
      await deps.google.stopChannel(token, {
        channelId: state.channel_id,
        resourceId: state.resource_id,
      });
    } catch {
      // an expired/unknown channel is fine — the new one replaces it
    }
  }
  const channelId = deps.randomId();
  const channelToken = deps.randomId();
  const w = await deps.google.watchEvents(token, state.calendar_id, {
    channelId,
    token: channelToken,
    address: deps.config.webhookAddress,
  });
  const expiresAt = new Date(w.expiration > 0 ? w.expiration : nowMs + 7 * DAY_MS).toISOString();
  state.channel_id = channelId;
  state.channel_token = channelToken;
  state.resource_id = w.resourceId;
  state.channel_expires_at = expiresAt;
  await deps.saveState(state.user_id, {
    channel_id: channelId,
    channel_token: channelToken,
    resource_id: w.resourceId,
    channel_expires_at: expiresAt,
  });
  return true;
}

export interface WriteBackReport {
  inserted: number;
  patched: number;
  deleted: number;
}

/** Local-midnight window of the plan day and the next (write-back scope, ADR-0012 §10). */
export function writeBackWindow(nowMs: number, tz: string): { fromIso: string; toIso: string } {
  const wc = wallClock(nowMs, tz);
  const from = localMidnightUtcMs(tz, wc.year, wc.month, wc.day);
  return {
    fromIso: new Date(from).toISOString(),
    toIso: new Date(from + 2 * DAY_MS + 3 * 3_600_000).toISOString(), // + DST slack
  };
}

export function writeBackSummary(title: string): string {
  return `Hourwell · ${title}`.slice(0, 200);
}

/**
 * FR-03 opt-in write-back: open blocks of today + tomorrow exist in the primary calendar as
 * transparent events keyed by `extendedProperties.private.hourwell`; closed blocks (rejected,
 * expired, displaced, lapsed, completed) delete theirs. Patch only when the slot moved.
 */
export async function writeBack(deps: SyncDeps, state: GcalState): Promise<WriteBackReport> {
  const report: WriteBackReport = { inserted: 0, patched: 0, deleted: 0 };
  if (!state.write_back || state.scope !== 'write') return report;
  const token = await ensureAccessToken(deps, state);
  const { fromIso, toIso } = writeBackWindow(deps.now(), state.timezone);
  const recs = await deps.loadWriteBackRecs(state.user_id, fromIso, toIso);
  for (const r of recs) {
    const open = OPEN_STATUSES.has(r.status);
    const body: WriteBackEvent = {
      summary: writeBackSummary(r.title),
      startIso: r.slot_start,
      endIso: r.slot_end,
      recommendationId: r.id,
    };
    if (open && r.gcal_event_id === null) {
      const id = await deps.google.insertEvent(token, state.calendar_id, body);
      await deps.saveWriteBack(state.user_id, r.id, {
        gcal_event_id: id,
        gcal_synced_slot_start: r.slot_start,
      });
      report.inserted++;
    } else if (open && r.gcal_event_id !== null && r.gcal_synced_slot_start !== r.slot_start) {
      await deps.google.patchEvent(token, state.calendar_id, r.gcal_event_id, body);
      await deps.saveWriteBack(state.user_id, r.id, {
        gcal_event_id: r.gcal_event_id,
        gcal_synced_slot_start: r.slot_start,
      });
      report.patched++;
    } else if (!open && r.gcal_event_id !== null) {
      await deps.google.deleteEvent(token, state.calendar_id, r.gcal_event_id);
      await deps.saveWriteBack(state.user_id, r.id, {
        gcal_event_id: null,
        gcal_synced_slot_start: null,
      });
      report.deleted++;
    }
  }
  return report;
}

/**
 * Remove every mirrored `Hourwell ·` event from the user's calendar and forget the ids — on
 * disconnect (BEFORE the token is revoked) and when the write-back is switched off (adversarial
 * #11). Best effort per event: an already-deleted event counts as removed.
 */
export async function clearWriteBack(deps: SyncDeps, state: GcalState): Promise<number> {
  const mirrored = await deps.loadWriteBackMirrored(state.user_id);
  if (mirrored.length === 0) return 0;
  const token = await ensureAccessToken(deps, state);
  let removed = 0;
  for (const r of mirrored) {
    if (r.gcal_event_id === null) continue;
    try {
      await deps.google.deleteEvent(token, state.calendar_id, r.gcal_event_id);
    } catch {
      // keep going: a stale event is a cosmetic residue, a stuck disconnect is not
    }
    await deps.saveWriteBack(state.user_id, r.id, {
      gcal_event_id: null,
      gcal_synced_slot_start: null,
    });
    removed++;
  }
  return removed;
}

export { HOURWELL_MARKER };

/**
 * Best-effort teardown of a Google connection, in this order: our write-back events out of the
 * user's calendar while we still hold a token, then the push channel, then the token itself.
 * Google may already have revoked/expired everything — the first two steps are best effort
 * (disconnect from Settings, ADR-0012 §10; account erasure, ADR-0014 §8).
 */
export async function disconnectGoogle(
  deps: SyncDeps,
  state: GcalState,
  revokeToken: (token: string) => Promise<boolean>,
): Promise<void> {
  if (state.refresh_token === null) return;
  try {
    await clearWriteBack(deps, state);
    if (state.channel_id !== null && state.resource_id !== null) {
      const access = await ensureAccessToken(deps, state);
      await deps.google.stopChannel(access, {
        channelId: state.channel_id,
        resourceId: state.resource_id,
      });
    }
  } catch {
    // ignore — Google may already have revoked/expired everything
  }
  await revokeToken(state.refresh_token);
}
