-- Post-P12 (iPhone pass, 2026-09-08 — adversarial pass on the fix batch, finding #1):
-- persist_plan's supersede must not expire rows that already carry facts or whose slot has
-- ended. The reward mapping skips `expired` rows ("no reward, ever", _shared/rewards.ts) and a
-- pre_plan sync runs no reward pass, so a lapse (or a skip / move / completion pushed only by the
-- pre-plan sync) followed by a manual re-plan the same day never became a tuple — an upward
-- reward bias on every day with a re-plan after a miss. Only the supersede CTE changes; the
-- signature, grants and the rest of the body are the P8 definition (20260828120000_p8_sync.sql).
create or replace function public.persist_plan(p_user_id uuid, p_plan jsonb, p_recs jsonb, p_supersede uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan public.plans%rowtype;
  v_recs jsonb;
  v_expired jsonb;
begin
  insert into public.plans (user_id, plan_date, horizon, engine, model_version, arm, solver_status, telemetry, generated_at)
  values (p_user_id, (p_plan->>'plan_date')::date, coalesce(p_plan->>'horizon', 'day'), p_plan->>'engine',
          p_plan->>'model_version', p_plan->>'arm', p_plan->>'solver_status',
          coalesce(p_plan->'telemetry', '{}'::jsonb),
          coalesce(public.sync_ts(p_plan->'generated_at'), now()))
  returning * into v_plan;

  with ins as (
    insert into public.recommendations (user_id, plan_id, task_id, chunk_index, slot_start, slot_end,
      context_bucket, features, q_hat, confidence, rationale_key, rationale_params, is_experiment,
      engine, model_version, propensity)
    select p_user_id, v_plan.id, (a->>'task_id')::uuid, coalesce((a->>'chunk_index')::smallint, 0),
           (a->>'slot_start')::timestamptz, (a->>'slot_end')::timestamptz, a->>'context_bucket',
           coalesce(a->'features', '[]'::jsonb), (a->>'q_hat')::real, (a->>'confidence')::real,
           a->>'rationale_key', coalesce(a->'rationale_params', '{}'::jsonb),
           coalesce((a->>'is_experiment')::boolean, false), v_plan.engine, v_plan.model_version,
           (a->>'propensity')::double precision
    from jsonb_array_elements(coalesce(p_recs, '[]'::jsonb)) a
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(ins) order by ins.slot_start, ins.chunk_index), '[]'::jsonb)
    into v_recs from ins;

  -- Facts beat plans (invariant 2; iPhone pass 2026-09-08, adversarial pass #1): a superseding
  -- plan expires only rows that are still ahead AND carry no fact. A row whose slot has ended
  -- is history for the 23:55 authority (a lapse tuple, r = 0); a row with a fact (a completion,
  -- a skip, a move, a lapse observed by the device) is attributed from that fact. Before this,
  -- every still-`shown` row of the older plan was expired and the reward mapping skips
  -- `expired` forever — a lapse followed by a same-day manual re-plan lost its tuple.
  with exp as (
    update public.recommendations r set status = 'expired'
    where r.user_id = p_user_id
      and r.plan_id = any(coalesce(p_supersede, '{}'::uuid[]))
      and r.plan_id <> v_plan.id
      and r.status = 'shown'
      and r.slot_end > now()
      and not exists (
        select 1 from public.events e
        where e.recommendation_id = r.id and e.type <> 'recommendation_shown'
      )
    returning r.id
  )
  select coalesce(jsonb_agg(exp.id), '[]'::jsonb) into v_expired from exp;

  return jsonb_build_object('plan', to_jsonb(v_plan), 'recommendations', v_recs,
                            'expired_recommendation_ids', v_expired);
end $$;
