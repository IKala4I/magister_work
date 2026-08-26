-- P5 — service-owned id-set for /feedback idempotency (specs/07 §3.5 step 4: "the update is
-- applied only if the tuple's recommendation isn't already reflected (id-set check)").
--
-- Ownership: written ONLY by the RecSys service (trusted backend connecting through the
-- pooler); `feedback_rewards` stays the edge functions' store of reward tuples. No FK to
-- `recommendations` on purpose: this is bookkeeping, not audit substrate — a stale key is
-- harmless, and the service must never be blocked by row-ordering between the two writers.
-- Erasure (FR-42) cascades from auth.users like every user-owned table.

create table public.recsys_applied_tuples (
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid not null,
  kind text not null check (kind in ('outcome','override_out','override_in')),
  state_version int not null,
  applied_at timestamptz not null default now(),
  primary key (user_id, recommendation_id, kind)
);

comment on table public.recsys_applied_tuples is
  'RecSys service: (recommendation_id, kind) already reflected in bandit_state/beta_cells. Idempotent /feedback re-delivery (specs/07 §3.5). Service-only; no client access.';

alter table public.recsys_applied_tuples enable row level security;
-- RLS on, no policies: clients (anon/authenticated) can never read or write this table.
revoke all on public.recsys_applied_tuples from anon, authenticated;
