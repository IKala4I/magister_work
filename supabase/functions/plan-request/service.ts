/**
 * The /plan round trip to the RecSys service under the NFR-R2 fallback budget (Appendix A
 * "1.9 s total, then heuristic"). Every non-success is classified so `plans.telemetry.ef.reason`
 * tells the outage story apart from a study arm: timeout (cold Space), network (Space gone),
 * http (5xx/4xx), invalid_response (contract drift), not_configured (no RECSYS_URL secret).
 */
import type { ServicePlanRequest, ServicePlanResponse } from '../_shared/types.ts';

export type ServiceCall =
  | { kind: 'ok'; response: ServicePlanResponse; status: number; ms: number }
  | { kind: 'timeout'; status: null; ms: number }
  | { kind: 'network'; status: null; ms: number }
  | { kind: 'http'; status: number; ms: number }
  | { kind: 'invalid_response'; status: number; ms: number }
  | { kind: 'not_configured'; status: null; ms: number };

export interface ServiceConfig {
  url: string | null;
  serviceKey: string | null;
}

function looksLikePlanResponse(v: unknown): v is ServicePlanResponse {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r.engine === 'learned' &&
    typeof r.model_version === 'string' &&
    typeof r.solver_status === 'string' &&
    Array.isArray(r.assignments) &&
    Array.isArray(r.unplaced) &&
    typeof r.telemetry === 'object' &&
    r.telemetry !== null &&
    r.assignments.every(
      (a) =>
        typeof a === 'object' && a !== null &&
        typeof (a as Record<string, unknown>).task_id === 'string' &&
        Array.isArray((a as Record<string, unknown>).features) &&
        typeof (a as Record<string, unknown>).slot_start === 'string',
    )
  );
}

export async function callService(
  config: ServiceConfig,
  body: ServicePlanRequest,
  budgetMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ServiceCall> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  if (config.url === null || config.serviceKey === null) {
    return { kind: 'not_configured', status: null, ms: 0 };
  }
  let res: Response;
  try {
    res = await fetchImpl(`${config.url.replace(/\/$/, '')}/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-service-key': config.serviceKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(budgetMs, 1)),
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { kind: 'timeout', status: null, ms: ms() };
    }
    return { kind: 'network', status: null, ms: ms() };
  }
  if (!res.ok) {
    await res.body?.cancel();
    return { kind: 'http', status: res.status, ms: ms() };
  }
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return { kind: 'invalid_response', status: res.status, ms: ms() };
  }
  if (!looksLikePlanResponse(parsed)) {
    return { kind: 'invalid_response', status: res.status, ms: ms() };
  }
  return { kind: 'ok', response: parsed, status: res.status, ms: ms() };
}

/**
 * Fire-and-forget wake-up of a cold Space after a fallback (NFR-R2 "feeds baseline data";
 * the next request should find the service warm). The probe only needs to reach the host.
 */
export function wakeService(config: ServiceConfig, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (config.url === null) return Promise.resolve();
  return fetchImpl(`${config.url.replace(/\/$/, '')}/healthz`, {
    signal: AbortSignal.timeout(3000),
  })
    .then((r) => r.body?.cancel())
    .catch(() => undefined);
}
