/**
 * Persistence through the SERVICE-ROLE client: `plans` and `recommendations` are service-
 * authored rows (clients hold select + status/version update only — base migration RLS).
 * Every assignment field lands on the row (specs/07 §4.1 + M-01 `propensity`); per-plan
 * experiment data (`experiment_top_m`, drops, degradation, tick size, seed) lives in
 * `plans.telemetry` for P11 replay. A regenerated plan supersedes the still-`shown` rows of
 * earlier plans for the same date/horizon (`expired`, never deleted — audit substrate).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanRow, RecommendationRow } from '../_shared/types.ts';
import type { PersistInput, PersistResult } from './handler.ts';

// deno-lint-ignore no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

function fail(step: string, error: { message: string } | null): never {
  throw new Error(`${step}: ${error?.message ?? 'unknown error'}`);
}

const REC_COLUMNS =
  'id, user_id, plan_id, task_id, chunk_index, slot_start, slot_end, context_bucket, features, q_hat, confidence, rationale_key, rationale_params, is_experiment, engine, model_version, status, attributed_at, propensity, conflict_flag, version, created_at, updated_at, server_seq';

export async function persist(client: AnyClient, input: PersistInput): Promise<PersistResult> {
  const { data: plan, error: planErr } = await client
    .from('plans')
    .insert({
      user_id: input.userId,
      plan_date: input.planDate,
      horizon: input.horizon,
      engine: input.engine,
      model_version: input.modelVersion,
      arm: input.arm,
      solver_status: input.solverStatus,
      telemetry: input.telemetry,
      generated_at: new Date(input.nowMs).toISOString(),
    })
    .select(
      'id, user_id, plan_date, horizon, engine, model_version, arm, solver_status, telemetry, generated_at, server_seq',
    )
    .single();
  if (planErr || plan === null) fail('plans insert', planErr);

  let recommendations: RecommendationRow[] = [];
  if (input.assignments.length > 0) {
    const { data, error } = await client
      .from('recommendations')
      .insert(
        input.assignments.map((a) => ({
          user_id: input.userId,
          plan_id: plan.id,
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
          engine: input.engine,
          model_version: input.modelVersion,
          propensity: a.propensity,
        })),
      )
      .select(REC_COLUMNS);
    if (error) fail('recommendations insert', error);
    recommendations = (data ?? []) as RecommendationRow[];
    recommendations.sort((
      x,
      y,
    ) => (x.slot_start < y.slot_start
      ? -1
      : x.slot_start > y.slot_start
      ? 1
      : x.chunk_index - y.chunk_index)
    );
  }

  // supersede: still-`shown` rows of the earlier plans the context read found (never this one)
  let expired: string[] = [];
  const olderIds = input.supersedePlanIds.filter((id) => id !== plan.id);
  if (olderIds.length > 0) {
    const { data, error } = await client
      .from('recommendations')
      .update({ status: 'expired' })
      .eq('user_id', input.userId)
      .in('plan_id', olderIds)
      .eq('status', 'shown')
      .select('id');
    if (error) fail('recommendations expire', error);
    expired = (data ?? []).map((r) => r.id as string);
  }

  return { plan: plan as PlanRow, recommendations, expiredRecommendationIds: expired };
}
