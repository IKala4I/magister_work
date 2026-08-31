-- P12 (release prep): least-privilege DB role for the RecSys service.
-- Revisit item [P5, 2026-08-26]: PostgresRepo connects as the pooler's `postgres` role
-- (RLS-bypassing) — least privilege wants a dedicated role limited to model-state tables.
-- This migration creates `recsys_service` with grants + RLS policies for EXACTLY the
-- surface services/recsys/src/hourwell_recsys/repo.py uses. The role ships NOLOGIN: the
-- password is set by the owner out-of-band (never committed), and the VM switches via
-- RECSYS_DATABASE_URL with a fallback to the old DSN — runbook §18. Until the owner
-- completes those steps, runtime behaviour is unchanged.
-- The training container intentionally KEEPS the privileged DSN (ADR-0015: its NFR-S3
-- export + registry surface is wider by design and it serves no client traffic).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'recsys_service') then
    create role recsys_service nologin;
  end if;
end
$$;

grant usage on schema public to recsys_service;

-- exactly PostgresRepo's statements (repo.py): nothing more, and no DELETE anywhere —
-- corrections rebuild state by recompute-and-update, never by row deletion (invariant 6).
grant select, update         on public.beta_cells            to recsys_service;
grant select, insert, update on public.bandit_state          to recsys_service;
grant select, insert, update on public.blend_state           to recsys_service;
grant select, insert         on public.recsys_applied_tuples to recsys_service;
grant select                 on public.feedback_rewards      to recsys_service;
grant select, insert, update on public.belief_labels         to recsys_service;

-- RLS is enabled on every table (NFR-S1); the backend serves every user, so its policies
-- are role-scoped, not row-scoped — the grants above are the real perimeter (no DELETE,
-- no other tables, nothing outside public).
create policy recsys_service_beta_cells on public.beta_cells
  for all to recsys_service using (true) with check (true);
create policy recsys_service_bandit_state on public.bandit_state
  for all to recsys_service using (true) with check (true);
create policy recsys_service_blend_state on public.blend_state
  for all to recsys_service using (true) with check (true);
create policy recsys_service_applied_tuples on public.recsys_applied_tuples
  for all to recsys_service using (true) with check (true);
create policy recsys_service_feedback_rewards on public.feedback_rewards
  for select to recsys_service using (true);
create policy recsys_service_belief_labels on public.belief_labels
  for all to recsys_service using (true) with check (true);
