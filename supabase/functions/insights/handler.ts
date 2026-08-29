/**
 * `insights` — the read side of the P9 trust surfaces (FR-33, FR-40, FR-41; ADR-0013). One
 * user-JWT call answers everything the Insights tab renders:
 *   • the RecSys `/insights` document (Beta-cell posteriors, beliefs with the FR-41 label in
 *     force, rung-2 flags, the learning-mode badge) fetched with the shared backend key — the
 *     client never talks to the model service directly (invariant 1, ADR-0007 §12);
 *   • weekly PAR (FR-33 "adherence stats") from `_shared/par.ts` — pre-registered code over
 *     recommendations + focus facts only (spec-conflicts H2), read under the USER's RLS client;
 *   • the chronotype class the priors assume (File 04 §3), so the "what Hourwell believes"
 *     screen can say where day-0 beliefs came from.
 * Labels themselves never come through here: they are facts (`belief_label` events) that ride
 * the op outbox and reach the service through the sync-resolve reward pass.
 */
import { type AdherenceWeek, type ParBlock, type ParFact, weeklyPar } from '../_shared/par.ts';

export interface Profile {
  timezone: string;
  chronotype_class: string | null;
  survey_skipped: boolean;
}

export interface ServiceInsights {
  heatmap: unknown[];
  affinities: unknown[];
  adherence: unknown[];
  beliefs?: unknown[];
  learning_mode?: boolean;
  labels?: unknown[];
}

export type ServiceCall =
  | { kind: 'ok'; body: ServiceInsights; ms: number }
  | { kind: 'not_configured' }
  | { kind: 'failed'; status: number | null; detail: string; ms: number };

export interface Deps {
  now(): number;
  verifyUser(token: string): Promise<string | null>;
  loadProfile(userId: string): Promise<Profile | null>;
  fetchInsights(userId: string): Promise<ServiceCall>;
  /** Blocks with slot_end ≥ fromIso (the PAR denominator candidates), any status. */
  loadBlocks(userId: string, fromIso: string): Promise<ParBlock[]>;
  /** `focus_end` facts since fromIso. */
  loadFocusFacts(userId: string, fromIso: string): Promise<ParFact[]>;
}

export interface InsightsDocument extends ServiceInsights {
  adherence: AdherenceWeek[];
  chronotype_class: string | null;
  survey_skipped: boolean;
  generated_at: string;
  service_ms: number;
}

/** Weeks of adherence history the tab shows (FR-33 "trend"). */
export const ADHERENCE_WEEKS = 8;
const DAY_MS = 86_400_000;
const JSON_HEADERS = { 'content-type': 'application/json' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  return m === null ? null : m[1].trim();
}

export async function handleInsights(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const token = bearer(req);
  if (token === null) return json(401, { error: 'unauthorized', detail: 'missing bearer token' });
  const userId = await deps.verifyUser(token);
  if (userId === null) return json(401, { error: 'unauthorized', detail: 'invalid token' });
  const profile = await deps.loadProfile(userId);
  if (profile === null) return json(404, { error: 'profile_missing' });

  const nowMs = deps.now();
  const fromIso = new Date(nowMs - (ADHERENCE_WEEKS + 1) * 7 * DAY_MS).toISOString();
  const [service, blocks, facts] = await Promise.all([
    deps.fetchInsights(userId),
    deps.loadBlocks(userId, fromIso),
    deps.loadFocusFacts(userId, fromIso),
  ]);
  if (service.kind !== 'ok') {
    // the client keeps its cached document (NFR-R1); PAR alone would misrepresent the tab
    return json(503, {
      error: service.kind === 'not_configured' ? 'service_not_configured' : 'service_unavailable',
      detail: service.kind === 'failed' ? service.detail : undefined,
    });
  }
  const doc: InsightsDocument = {
    ...service.body,
    adherence: weeklyPar(blocks, facts, profile.timezone, nowMs, ADHERENCE_WEEKS),
    chronotype_class: profile.chronotype_class,
    survey_skipped: profile.survey_skipped,
    generated_at: new Date(nowMs).toISOString(),
    service_ms: service.ms,
  };
  return json(200, doc);
}
