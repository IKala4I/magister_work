/**
 * Google Calendar connection from the device (FR-03; ADR-0012 §10): the app only ever asks the
 * `gcal-connect` function for a consent URL and opens it in the system browser; the code
 * exchange, the refresh token and the sync all live server-side. The browser returns through
 * `hourwell://gcal-callback` (app/gcal-callback.tsx), after which a sync pulls the imported
 * meetings.
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { track } from '../observability/analytics';

import { syncNow } from './engine';
import { invokeFunction } from './invoke';
import type { GcalConnectBody, GcalConnectResponse, GcalScope, GcalStatus } from './types';

export const GCAL_CALLBACK_PATH = 'gcal-callback';

export type GcalResult =
  | { ok: true; status: GcalStatus }
  | { ok: false; code: 'unavailable' | 'offline' | 'not_configured' | 'cancelled' | 'failed' };

function statusOf(res: GcalConnectResponse | undefined): GcalStatus | null {
  return res !== undefined && 'status' in res ? res.status : null;
}

type CallFailure = 'unavailable' | 'offline' | 'not_configured' | 'failed';

async function call(
  body: GcalConnectBody,
): Promise<{ kind: 'ok'; data: GcalConnectResponse } | { kind: CallFailure }> {
  const res = await invokeFunction<GcalConnectResponse>('gcal-connect', body);
  if (res.kind === 'ok') return { kind: 'ok', data: res.data };
  if (res.kind === 'no-session') return { kind: 'unavailable' };
  if (res.kind === 'offline') return { kind: 'offline' };
  if (res.kind === 'http' && res.status === 503) return { kind: 'not_configured' };
  return { kind: 'failed' };
}

export async function gcalStatus(): Promise<GcalResult> {
  const r = await call({ action: 'status' });
  if (r.kind !== 'ok') return { ok: false, code: r.kind };
  const status = statusOf(r.data);
  return status ? { ok: true, status } : { ok: false, code: 'failed' };
}

/**
 * Start the consent flow (read scope, or the incremental write scope for the opt-in write-back)
 * and wait for the browser to come back. The callback route runs the sync; this resolves with
 * the fresh status.
 */
export async function gcalConnect(scope: GcalScope): Promise<GcalResult> {
  track('gcal_connection', { event: scope === 'write' ? 'write_back_started' : 'connect_started' });
  const r = await call({ action: 'start', scope });
  if (r.kind !== 'ok') return { ok: false, code: r.kind };
  if (!('auth_url' in r.data)) return { ok: false, code: 'failed' };
  const result = await WebBrowser.openAuthSessionAsync(
    r.data.auth_url,
    Linking.createURL(GCAL_CALLBACK_PATH),
  );
  if (result.type !== 'success') return { ok: false, code: 'cancelled' };
  const landed = new URL(result.url).searchParams.get('status');
  if (landed !== 'ok') {
    track('gcal_connection', { event: 'failed' });
    return { ok: false, code: 'failed' };
  }
  track('gcal_connection', { event: scope === 'write' ? 'write_back_on' : 'connected' });
  void syncNow('manual');
  return gcalStatus();
}

export async function gcalDisconnect(): Promise<GcalResult> {
  const r = await call({ action: 'disconnect' });
  if (r.kind !== 'ok') return { ok: false, code: r.kind };
  track('gcal_connection', { event: 'disconnected' });
  void syncNow('manual');
  const status = statusOf(r.data);
  return status ? { ok: true, status } : { ok: false, code: 'failed' };
}

export async function gcalSetWriteBack(enabled: boolean): Promise<GcalResult> {
  const r = await call({ action: 'set_write_back', enabled });
  if (r.kind !== 'ok') return { ok: false, code: r.kind };
  const status = statusOf(r.data);
  if (!status) return { ok: false, code: 'failed' };
  track('gcal_connection', { event: enabled ? 'write_back_on' : 'write_back_off' });
  return { ok: true, status };
}
