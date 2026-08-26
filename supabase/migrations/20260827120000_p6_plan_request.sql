-- P6 — plan-request edge function support (UC-03; specs/07 §4.1 plans/recommendations).
--
-- (1) The base `plans_user_date_idx (user_id, plan_date)` already serves "previous plan for the
--     date" (AddHint warm start) and the supersede update. The per-user rolling-24 h rate-limit
--     count (`generated_at >= now() - 24h`) needs the time axis:
create index plans_user_generated_idx on public.plans (user_id, generated_at desc);

-- (2) Documented telemetry keys (jsonb stays schemaless by design; File 04 §1.5 "flagged in
--     telemetry"). P11 replay reads `ef.experiment.top_m` (A_m(x)), `ef.experiment_dropped`,
--     `service.degradation`, `ef.tick_minutes`, `ef.rng_seed`/`service.rng_seed`.
comment on column public.plans.telemetry is
  'P6 keys: ef {reason: learned|arm_a|fallback:<kind>, service_status, service_ms, budget_ms, total_ms, experiment {task_id, bucket_id, top_m, propensity, n_eligible} | null, experiment_drawn, experiment_dropped, rng_seed, tick_minutes, n_ticks, cells_source, n_tasks}; service: the RecSys /plan telemetry or null; request {horizon, trigger, n_busy, n_previous}; unplaced [{task_id, reason}]; infeasible {options} | null.';
comment on column public.recommendations.engine is
  'NFR-R2 tag: learned (RecSys /plan) or heuristic (arm A, or the fallback — see plans.telemetry.ef.reason).';
