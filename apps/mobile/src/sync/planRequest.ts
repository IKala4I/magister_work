/**
 * The P6 plan bridge (UC-03 main path, NFR-P1): push pending task rows → invoke the
 * `plan-request` edge function with the user's session → mirror the response into SQLite in
 * one transaction (src/db/plans.ts) → PostHog `plan_requested` with the measured end-to-end
 * time. The client never computes a plan (invariant 1); offline it simply keeps showing the
 * last mirrored plan (NFR-R1) and reports `offline`.
 */
import type { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '../auth/client';
import { db } from '../db/client';
import { applyPlanResponse, type PlanRow, type PlanTrigger } from '../db/plans';
import type { LocalDb } from '../db/writes';
import { track } from '../observability/analytics';

import { pushTasksIfPossible } from './taskPush';
import type { PlanRequestBody, PlanRequestResponse } from './planTypes';

export type PlanRequestOutcome =
  | { kind: 'planned'; plan: PlanRow; durationMs: number }
  | { kind: 'empty_inbox'; durationMs: number }
  | { kind: 'no-session' }
  | { kind: 'offline' }
  | { kind: 'rate_limited' }
  | { kind: 'profile_missing' }
  | { kind: 'failed'; detail: string };

let inFlight: Promise<PlanRequestOutcome> | null = null;

export function isPlanRequestInFlight(): boolean {
  return inFlight !== null;
}

export function requestPlan(input: {
  planDate: string;
  trigger: PlanTrigger;
  now?: Date;
}): Promise<PlanRequestOutcome> {
  if (inFlight) return inFlight; // one request at a time; concurrent callers share the result
  inFlight = run(input).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(input: {
  planDate: string;
  trigger: PlanTrigger;
  now?: Date;
}): Promise<PlanRequestOutcome> {
  if (!supabase) return { kind: 'no-session' };
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return { kind: 'no-session' };
  const started = Date.now();
  const now = input.now ?? new Date();

  const pushed = await pushTasksIfPossible();
  if (pushed === 'failed') return { kind: 'offline' }; // the push is the first network hop

  const body: PlanRequestBody = {
    plan_date: input.planDate,
    horizon: 'day',
    now: now.toISOString(),
    trigger: input.trigger,
  };
  const { data: response, error } = await supabase.functions.invoke<PlanRequestResponse>(
    'plan-request',
    { body },
  );
  const durationMs = Date.now() - started;
  if (error) {
    // supabase-js: FunctionsFetchError = no response at all (network); FunctionsHttpError = non-2xx
    if (error.name === 'FunctionsFetchError') return { kind: 'offline' };
    const status = (error as FunctionsHttpError).context?.status as number | undefined;
    if (status === 429) return { kind: 'rate_limited' };
    if (status === 404) return { kind: 'profile_missing' };
    track('plan_requested', {
      trigger: input.trigger,
      outcome: 'error',
      duration_ms: durationMs,
      engine: null,
      model_version: null,
    });
    return { kind: 'failed', detail: error.message };
  }
  if (!response) return { kind: 'failed', detail: 'empty response' };
  if (response.status === 'empty_inbox') {
    track('plan_requested', {
      trigger: input.trigger,
      outcome: 'empty_inbox',
      duration_ms: durationMs,
      engine: null,
      model_version: null,
    });
    return { kind: 'empty_inbox', durationMs };
  }
  const plan = applyPlanResponse(db as unknown as LocalDb, {
    userId: uid,
    response,
    trigger: input.trigger,
    now,
  });
  const reason = (plan.telemetry as { ef?: { reason?: string } })?.ef?.reason ?? 'unknown';
  track('plan_requested', {
    trigger: input.trigger,
    outcome: reason.startsWith('fallback') ? 'fallback' : reason === 'arm_a' ? 'arm_a' : 'learned',
    duration_ms: durationMs,
    engine: plan.engine,
    model_version: plan.modelVersion,
  });
  for (const r of response.recommendations) {
    track('recommendation_shown', {
      model_version: r.model_version,
      engine: r.engine,
      is_experiment: r.is_experiment,
    });
  }
  return { kind: 'planned', plan, durationMs };
}
