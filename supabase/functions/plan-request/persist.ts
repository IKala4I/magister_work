/**
 * Persistence through the SERVICE-ROLE client: `plans` and `recommendations` are service-
 * authored rows (clients hold select + status/version update only — base migration RLS).
 * Since P8 the three writes — plan row, recommendation rows, supersede of the still-`shown`
 * rows of earlier plans for the date — are ONE transaction in the `persist_plan()` RPC
 * (ADR-0012 §8; the P6 compensating delete is gone). Every assignment field lands on the row
 * (specs/07 §4.1 + M-01 `propensity`); per-plan experiment data lives in `plans.telemetry`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanRow, RecommendationRow } from '../_shared/types.ts';
import type { PersistInput, PersistResult } from './handler.ts';

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

function fail(step: string, error: { message: string } | null): never {
  throw new Error(`${step}: ${error?.message ?? 'unknown error'}`);
}

export async function persist(client: AnyClient, input: PersistInput): Promise<PersistResult> {
  const { data, error } = await client.rpc('persist_plan', {
    p_user_id: input.userId,
    p_plan: {
      plan_date: input.planDate,
      horizon: input.horizon,
      engine: input.engine,
      model_version: input.modelVersion,
      arm: input.arm,
      solver_status: input.solverStatus,
      telemetry: input.telemetry,
      generated_at: new Date(input.nowMs).toISOString(),
    },
    p_recs: input.assignments.map((a) => ({
      task_id: a.task_id,
      chunk_index: a.chunk_index,
      slot_start: a.slot_start,
      slot_end: a.slot_end,
      context_bucket: a.context_bucket,
      features: a.features,
      q_hat: a.q_hat,
      confidence: a.confidence,
      rationale_key: a.rationale_key,
      rationale_params: a.rationale_params,
      is_experiment: a.is_experiment,
      propensity: a.propensity,
    })),
    p_supersede: input.supersedePlanIds,
  });
  if (error) fail('persist_plan', error);
  const out = data as {
    plan: PlanRow;
    recommendations: RecommendationRow[];
    expired_recommendation_ids: string[];
  } | null;
  if (out === null || typeof out !== 'object' || !out.plan) fail('persist_plan', null);
  return {
    plan: out.plan,
    recommendations: out.recommendations ?? [],
    expiredRecommendationIds: out.expired_recommendation_ids ?? [],
  };
}
