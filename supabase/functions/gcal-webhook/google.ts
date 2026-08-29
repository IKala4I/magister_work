/**
 * The real Google client bound to `fetch` — the `GoogleClient` the sync core is injected with.
 * Shared by the three Google functions.
 */
import {
  deleteEvent,
  insertEvent,
  listEvents,
  patchEvent,
  refreshAccessToken,
  stopChannel,
  watchEvents,
} from '../_shared/gcal.ts';
import type { GoogleClient } from '../_shared/gcal_sync.ts';

export const googleClient: GoogleClient = {
  refreshAccessToken: (cfg, rt) => refreshAccessToken(cfg, rt),
  listEvents: (t, cal, params) => listEvents(t, cal, params),
  watchEvents: (t, cal, input) => watchEvents(t, cal, input),
  stopChannel: (t, input) => stopChannel(t, input),
  insertEvent: (t, cal, e) => insertEvent(t, cal, e),
  patchEvent: (t, cal, id, e) => patchEvent(t, cal, id, e),
  deleteEvent: (t, cal, id) => deleteEvent(t, cal, id),
};

/** GCAL_CLIENT_ID / GCAL_CLIENT_SECRET / GCAL_WEBHOOK_BASE (the functions URL) → config or null. */
export function googleConfigFromEnv(): import('../_shared/gcal.ts').GoogleConfig | null {
  const clientId = Deno.env.get('GCAL_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GCAL_CLIENT_SECRET') ?? '';
  const base = (Deno.env.get('GCAL_WEBHOOK_BASE') ?? '').replace(/\/$/, '');
  if (clientId.length === 0 || clientSecret.length === 0 || base.length === 0) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: `${base}/gcal-callback`,
    webhookAddress: `${base}/gcal-webhook`,
  };
}
