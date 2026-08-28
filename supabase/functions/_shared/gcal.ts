/**
 * Google Calendar API v3 + OAuth 2.0 client for the edge functions (FR-03, UC-09; ADR-0012 §10).
 * Thin, fetch-based (no SDK — Deno edge runtime), every call takes `fetchImpl` so the handlers
 * are tested against a fake Google. Endpoints verified 2026-08-28 (ctx7: Google Calendar API
 * reference `events.list` / `events.watch` / `channels.stop`, Google Identity OAuth 2.0 web
 * server flow): authorization `accounts.google.com/o/oauth2/v2/auth`, token + refresh
 * `oauth2.googleapis.com/token`, revoke `oauth2.googleapis.com/revoke`; incremental sync via
 * `syncToken` (410 → full resync), push channels via `events/watch` (default ttl 604 800 s).
 *
 * The pure half (event mapping, busy rule, overlap) is what the displacement logic depends on.
 */
import { localMidnightUtcMs } from './grid.ts';

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  /** The `gcal-callback` function URL registered on the OAuth client. */
  redirectUri: string;
  /** Public URL of `gcal-webhook` (push channel address). */
  webhookAddress: string;
}

export const GCAL_SCOPES = {
  read: 'https://www.googleapis.com/auth/calendar.events.readonly',
  write: 'https://www.googleapis.com/auth/calendar.events',
} as const;
export type GcalScopeKey = keyof typeof GCAL_SCOPES;

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/calendar/v3';
/** Google's default channel lifetime; renewed by the sweep when < 24 h remain. */
export const CHANNEL_TTL_SECONDS = 604_800;
/** Marker on write-back events: `extendedProperties.private.hourwell = <recommendation_id>`. */
export const HOURWELL_MARKER = 'hourwell';

export class GoogleApiError extends Error {
  constructor(readonly status: number, readonly body: string, readonly op: string) {
    super(`${op}: HTTP ${status} ${body.slice(0, 200)}`);
  }
}

// --- OAuth ------------------------------------------------------------------------------------

export function authUrl(cfg: GoogleConfig, input: { state: string; scope: GcalScopeKey }): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', GCAL_SCOPES[input.scope]);
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent'); // always mint a refresh token (server-held)
  u.searchParams.set('include_granted_scopes', 'true'); // incremental: read → write keeps read
  u.searchParams.set('state', input.state);
  return u.toString();
}

export interface TokenSet {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

async function tokenRequest(
  body: Record<string, string>,
  fetchImpl: typeof fetch,
  op: string,
): Promise<TokenSet> {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  if (!res.ok) throw new GoogleApiError(res.status, text, op);
  const json = JSON.parse(text) as Partial<TokenSet>;
  if (typeof json.access_token !== 'string' || typeof json.expires_in !== 'number') {
    throw new GoogleApiError(res.status, 'invalid token response', op);
  }
  return json as TokenSet;
}

export function exchangeCode(
  cfg: GoogleConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenSet> {
  return tokenRequest(
    {
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    },
    fetchImpl,
    'token exchange',
  );
}

export function refreshAccessToken(
  cfg: GoogleConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenSet> {
  return tokenRequest(
    {
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    },
    fetchImpl,
    'token refresh',
  );
}

/** Best effort: a failed revoke must not block a disconnect. */
export async function revokeToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Which of our scope keys a granted-scope string satisfies. */
export function scopeKeyOf(granted: string | undefined): GcalScopeKey | null {
  if (granted === undefined) return null;
  const parts = granted.split(/\s+/);
  if (parts.includes(GCAL_SCOPES.write)) return 'write';
  if (parts.includes(GCAL_SCOPES.read)) return 'read';
  return null;
}

// --- Calendar API -------------------------------------------------------------------------------

export interface GoogleDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  start?: GoogleDateTime;
  end?: GoogleDateTime;
  transparency?: string;
  eventType?: string;
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
  extendedProperties?: { private?: Record<string, string> };
  updated?: string;
}

export interface EventsPage {
  items: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
  /** Calendar time zone (all-day events are converted with it). */
  timeZone?: string;
}

async function api<T>(
  accessToken: string,
  method: string,
  path: string,
  fetchImpl: typeof fetch,
  op: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<{ status: number; json: T | null }> {
  const u = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) u.searchParams.set(k, v);
  const res = await fetchImpl(u.toString(), {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (res.status === 410) return { status: 410, json: null };
  if (!res.ok) throw new GoogleApiError(res.status, text, op);
  return { status: res.status, json: text.length === 0 ? null : (JSON.parse(text) as T) };
}

/** One page of `events.list`; `'gone'` when the sync token expired (410 → full resync). */
export async function listEvents(
  accessToken: string,
  calendarId: string,
  params: { syncToken?: string; timeMin?: string; timeMax?: string; pageToken?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<EventsPage | 'gone'> {
  const query: Record<string, string> = {
    singleEvents: 'true', // recurring series expanded into instances (sync tokens require it)
    showDeleted: 'true', // cancelled instances arrive as status=cancelled → tombstones
    maxResults: '250',
  };
  if (params.syncToken !== undefined) query.syncToken = params.syncToken;
  else {
    if (params.timeMin !== undefined) query.timeMin = params.timeMin;
    if (params.timeMax !== undefined) query.timeMax = params.timeMax;
  }
  if (params.pageToken !== undefined) query.pageToken = params.pageToken;
  const { status, json } = await api<EventsPage>(
    accessToken,
    'GET',
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    fetchImpl,
    'events.list',
    undefined,
    query,
  );
  if (status === 410 || json === null) return 'gone';
  return { ...json, items: json.items ?? [] };
}

export interface WatchResult {
  resourceId: string;
  /** Unix ms. */
  expiration: number;
}

export async function watchEvents(
  accessToken: string,
  calendarId: string,
  input: { channelId: string; token: string; address: string; ttlSeconds?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<WatchResult> {
  const { json } = await api<{ resourceId?: string; expiration?: string | number }>(
    accessToken,
    'POST',
    `/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    fetchImpl,
    'events.watch',
    {
      id: input.channelId,
      type: 'web_hook',
      address: input.address,
      token: input.token,
      params: { ttl: String(input.ttlSeconds ?? CHANNEL_TTL_SECONDS) },
    },
  );
  if (json === null || typeof json.resourceId !== 'string') {
    throw new GoogleApiError(200, 'invalid watch response', 'events.watch');
  }
  return { resourceId: json.resourceId, expiration: Number(json.expiration ?? 0) };
}

export async function stopChannel(
  accessToken: string,
  input: { channelId: string; resourceId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await api(accessToken, 'POST', '/channels/stop', fetchImpl, 'channels.stop', {
    id: input.channelId,
    resourceId: input.resourceId,
  });
}

export interface WriteBackEvent {
  summary: string;
  startIso: string;
  endIso: string;
  recommendationId: string;
}

function writeBackBody(e: WriteBackEvent) {
  return {
    summary: e.summary,
    start: { dateTime: e.startIso },
    end: { dateTime: e.endIso },
    transparency: 'transparent', // our own blocks never count as busy for anyone
    extendedProperties: { private: { [HOURWELL_MARKER]: e.recommendationId } },
  };
}

export async function insertEvent(
  accessToken: string,
  calendarId: string,
  e: WriteBackEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const { json } = await api<{ id?: string }>(
    accessToken,
    'POST',
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    fetchImpl,
    'events.insert',
    writeBackBody(e),
  );
  if (json === null || typeof json.id !== 'string') {
    throw new GoogleApiError(200, 'invalid insert response', 'events.insert');
  }
  return json.id;
}

export async function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  e: WriteBackEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await api(
    accessToken,
    'PATCH',
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    fetchImpl,
    'events.patch',
    writeBackBody(e),
  );
}

/** Idempotent: an already-deleted event (404/410) counts as deleted. */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    await api(
      accessToken,
      'DELETE',
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      fetchImpl,
      'events.delete',
    );
  } catch (err) {
    if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) return;
    throw err;
  }
}

// --- pure mapping -------------------------------------------------------------------------------

export interface MappedEvent {
  external_id: string;
  start_at: string;
  end_at: string;
  /** Display only (specs/07 §4.1) — never exported. */
  title: string | null;
  busy: boolean;
  deleted: boolean;
}

function allDayMs(date: string, tz: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (m === null) return null;
  try {
    return localMidnightUtcMs(tz, Number(m[1]), Number(m[2]), Number(m[3]));
  } catch {
    return null;
  }
}

/**
 * Google event → `calendar_events` row (ADR-0012 §10 import mapping) or null when the event is
 * not ours to import: our own write-back mirror (marker), an id-less item, or an all-day event
 * that Google marks free (its UI default). Busy = opaque and not declined by the user; working
 * locations and birthdays never block time. Cancelled instances become tombstones.
 */
export function mapGoogleEvent(e: GoogleEvent, calendarTz: string): MappedEvent | null {
  if (typeof e.id !== 'string' || e.id.length === 0) return null;
  if (e.extendedProperties?.private?.[HOURWELL_MARKER] !== undefined) return null;
  const transparent = e.transparency === 'transparent';
  const declined = (e.attendees ?? []).some((a) =>
    a.self === true && a.responseStatus === 'declined'
  );
  const neverBusy = e.eventType === 'workingLocation' || e.eventType === 'birthday';
  if (e.status === 'cancelled') {
    return {
      external_id: e.id,
      start_at: new Date(0).toISOString(),
      end_at: new Date(0).toISOString(),
      title: null,
      busy: false,
      deleted: true,
    };
  }
  let startMs: number | null = null;
  let endMs: number | null = null;
  if (e.start?.dateTime !== undefined && e.end?.dateTime !== undefined) {
    startMs = Date.parse(e.start.dateTime);
    endMs = Date.parse(e.end.dateTime);
  } else if (e.start?.date !== undefined && e.end?.date !== undefined) {
    if (transparent) return null; // Google's default for all-day events: free
    startMs = allDayMs(e.start.date, e.start.timeZone ?? calendarTz);
    endMs = allDayMs(e.end.date, e.end.timeZone ?? calendarTz); // exclusive end date
  }
  if (startMs === null || endMs === null || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }
  if (endMs <= startMs) return null;
  return {
    external_id: e.id,
    start_at: new Date(startMs).toISOString(),
    end_at: new Date(endMs).toISOString(),
    title: typeof e.summary === 'string' && e.summary.length > 0 ? e.summary.slice(0, 200) : null,
    busy: !transparent && !declined && !neverBusy,
    deleted: false,
  };
}

/** Half-open interval overlap. */
export function overlaps(
  aStartMs: number,
  aEndMs: number,
  bStartMs: number,
  bEndMs: number,
): boolean {
  return aStartMs < bEndMs && bStartMs < aEndMs;
}
