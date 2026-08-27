/**
 * POST /feedback to the RecSys service (specs/07 §5) with the shared backend key. A non-2xx or a
 * network failure leaves the tuples undelivered — the next sweep re-sends them; the service's
 * (recommendation_id, kind) id-set makes that a no-op (ADR-0007 §12). Nothing is lost when the
 * service is cold, down, or — today — not yet hosted (ADR-0009).
 */
import type { Tuple } from '../_shared/rewards.ts';

export interface ServiceConfig {
  url: string | null;
  serviceKey: string | null;
}

export type FeedbackCall =
  | { kind: 'ok'; state_version: number; updated: number; rebuilt: boolean; ms: number }
  | { kind: 'not_configured' }
  | { kind: 'failed'; status: number | null; detail: string; ms: number };

export type WireTuple = Omit<Tuple, 'source'>;

export function toWire(t: Tuple): WireTuple {
  const { source: _source, ...wire } = t;
  return wire;
}

export async function postFeedback(
  config: ServiceConfig,
  userId: string,
  tuples: readonly WireTuple[],
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<FeedbackCall> {
  if (config.url === null || config.serviceKey === null) return { kind: 'not_configured' };
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  let res: Response;
  try {
    res = await fetchImpl(`${config.url.replace(/\/$/, '')}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-service-key': config.serviceKey },
      body: JSON.stringify({ user_id: userId, tuples }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { kind: 'failed', status: null, detail: String((err as Error)?.name ?? err), ms: ms() };
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    return { kind: 'failed', status: res.status, detail, ms: ms() };
  }
  const body = await res.json().catch(() => null) as
    | { state_version?: number; updated?: number; rebuilt?: boolean }
    | null;
  if (body === null || typeof body.state_version !== 'number') {
    return { kind: 'failed', status: res.status, detail: 'invalid response', ms: ms() };
  }
  return {
    kind: 'ok',
    state_version: body.state_version,
    updated: body.updated ?? 0,
    rebuilt: body.rebuilt ?? false,
    ms: ms(),
  };
}
