-- P1 hardening — fixes from the fresh-context adversarial review (phase P1).
-- Findings addressed: (1) client task DELETE cascaded into recommendations →
-- feedback_rewards and SET-NULLed events rows, violating "excluded ≠ deleted"
-- (specs/07 §3.4.2) and events append-only; (2) status guard admitted server-side
-- statuses and never checked the previous state; (3) events.server_ts was client-
-- forgeable via the table-level INSERT grant; (4/9) missing FK + job-sweep indexes;
-- (6) sequence grants leaked setval() to clients; (7) events could reference other
-- users' rows (FK oracle); (8) prior seed lacked its model_registry row (File 04
-- §3.5); (10) missing invariant CHECKs on model-state tables; (11) unbounded event
-- payload sizes, unpinned trigger search_path.

-- (1) Audit-substrate FKs become NO ACTION (checked at end of statement): the FR-42
-- erasure cascade from auth.users still deletes everything in one statement, but a
-- client deleting a task that any recommendation/event references gets 23503 —
-- forcing the soft-delete path (tasks.deleted_at).
alter table public.recommendations drop constraint recommendations_task_id_fkey;
alter table public.recommendations add constraint recommendations_task_id_fkey
  foreign key (task_id) references public.tasks(id);
alter table public.recommendations drop constraint recommendations_plan_id_fkey;
alter table public.recommendations add constraint recommendations_plan_id_fkey
  foreign key (plan_id) references public.plans(id);
alter table public.events drop constraint events_task_id_fkey;
alter table public.events add constraint events_task_id_fkey
  foreign key (task_id) references public.tasks(id);
alter table public.events drop constraint events_recommendation_id_fkey;
alter table public.events add constraint events_recommendation_id_fkey
  foreign key (recommendation_id) references public.recommendations(id);
alter table public.feedback_rewards drop constraint feedback_rewards_recommendation_id_fkey;
alter table public.feedback_rewards add constraint feedback_rewards_recommendation_id_fkey
  foreign key (recommendation_id) references public.recommendations(id);

-- (2) Guard rewrite: fail-closed for non-service roles; clients move recommendations
-- only between plan-review states and never touch attributed rows. `completed` is
-- written by sync-resolve from facts (File 05 §2); `lapsed` authoritatively by
-- attribute-rewards (specs/07 §3.4.2) — the client's lapse mark stays local (File 05 §1).
create or replace function public.tg_guard_recommendation_status() returns trigger
language plpgsql security invoker as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    if new.status not in ('accepted', 'pinned', 'moved', 'rejected') then
      raise exception 'status % may not be set by clients', new.status;
    end if;
    if old.status not in ('shown', 'accepted', 'pinned', 'moved', 'rejected') then
      raise exception 'clients may not change a recommendation out of status %', old.status;
    end if;
    if old.attributed_at is not null then
      raise exception 'attributed recommendations are frozen for clients';
    end if;
  end if;
  return new;
end $$;

-- (3) server_ts is server-owned: replace the table-level INSERT grant with a column list
-- (id is GENERATED ALWAYS and needs no grant; server_ts falls back to its default).
revoke insert on public.events from authenticated;
grant insert (user_id, op_id, type, task_id, recommendation_id, payload, context,
              client_ts, local_day)
  on public.events to authenticated;

-- (7) events may only reference the author's own rows (closes the FK existence oracle
-- and keeps the training-archive joins clean).
drop policy events_insert on public.events;
create policy events_insert on public.events for insert
  with check (
    (select auth.uid()) = user_id
    and (task_id is null or exists (
      select 1 from public.tasks t
      where t.id = task_id and t.user_id = (select auth.uid())))
    and (recommendation_id is null or exists (
      select 1 from public.recommendations r
      where r.id = recommendation_id and r.user_id = (select auth.uid())))
  );

-- (11) size caps on client-supplied event fields (free-tier DoS hygiene)
alter table public.events add constraint events_op_id_len check (char_length(op_id) <= 128);
alter table public.events add constraint events_payload_size
  check (pg_column_size(payload) <= 65536);
alter table public.events add constraint events_context_size
  check (pg_column_size(context) <= 65536);

-- (4) FK-path indexes (cascade/lookup support; events is the largest table)
create index recommendations_task_idx on public.recommendations (task_id);
create index recommendations_plan_idx on public.recommendations (plan_id);
create index events_task_idx on public.events (task_id) where task_id is not null;
create index events_recommendation_idx on public.events (recommendation_id)
  where recommendation_id is not null;

-- (9) job-sweep indexes: nightly MC propensity back-fill (File 04 §2.3) and the
-- cross-user 23:55 attribution sweep (Appendix A)
create index recommendations_propensity_backfill_idx on public.recommendations (created_at)
  where propensity is null;
create index recommendations_attribution_sweep_idx on public.recommendations (slot_end)
  where attributed_at is null;

-- (6) sequence privileges: authenticated keeps only USAGE on sync_seq (needed by the
-- invoker-security trigger); setval() is revoked; the events identity sequence needs
-- no client privileges at all.
revoke all on sequence public.sync_seq from authenticated;
grant usage on sequence public.sync_seq to authenticated;
do $$
declare seq text := pg_get_serial_sequence('public.events', 'id');
begin
  execute format('revoke all on sequence %s from authenticated', seq);
  execute format('revoke all on sequence %s from anon', seq);
end $$;

-- (8) the v0 prior table is a registered model version (File 04 §3.5)
insert into public.model_registry (kind, version, metrics, promoted)
values ('priors', '0',
        '{"source": "File 04 §3.2–3.3 tables via logit-affine transform", "cells": 240}',
        true);

-- (10) invariant CHECKs on model-state tables (server-written; hygiene)
alter table public.blend_state add constraint blend_state_convex
  check (w_energy >= 0 and w_bandit >= 0 and abs(w_energy + w_bandit - 1) < 1e-6);
alter table public.beta_cells add constraint beta_cells_nonneg
  check (succ >= 0 and fail >= 0);
alter table public.bandit_state add constraint bandit_state_shapes
  check (cardinality(a_matrix) = d::int * d::int and cardinality(b_vector) = d::int);

-- (11) pin trigger-function search_path (Supabase linter hygiene; bodies already use
-- qualified or pg_catalog names)
alter function public.tg_set_server_seq() set search_path = '';
alter function public.tg_touch_updated_at() set search_path = '';
alter function public.tg_bump_version() set search_path = '';
alter function public.tg_guard_recommendation_status() set search_path = '';
