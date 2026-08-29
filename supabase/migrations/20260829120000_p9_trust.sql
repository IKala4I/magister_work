-- P9 — trust surfaces server side (FR-33, FR-41, UC-08; ADR-0013).
--
-- belief_labels: the user's ✓/✗ on a learned belief ("you do deep work best in the morning") is a
-- FACT the client logs as an `events` row of type `belief_label` (append-only, through the op
-- outbox — invariant 8) and, server-side, a *correction label* the RecSys service folds into the
-- named Beta cell as pseudo-observations during a full rebuild (invariant 6). This table is the
-- delivery ledger between the two: the trigger below materialises every `belief_label` event
-- into one row (id = the event's op_id, so a replayed op is a no-op), the sync-resolve reward
-- pass POSTs undelivered rows to the service (`/labels`), and `delivered_at` marks the ack —
-- the same store-then-deliver contract as feedback_rewards (specs/07 §3.5.5). The LATEST label
-- per cell is the one in force; earlier rows stay for audit. The client can read its own rows
-- (toggle state across devices) and never write them directly (no insert/update grant).
--
-- Vocabulary is the closed specs/07 state_ref form `beta:<category>.<daypart>.<day_type>`;
-- anything else fails the event insert → the op comes back `error` (the client validates the
-- same vocabulary before writing, so only a tampered client can reach this), nothing half-applied.

create table public.belief_labels (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('deep','admin','physical','learning')),
  daypart text not null check (daypart in ('EM','MO','MD','AF','EV','NT')),
  day_type text not null check (day_type in ('weekday','weekend')),
  state_ref text not null,
  label text not null check (label in ('correct','incorrect','none')),
  labeled_at timestamptz not null,
  source text not null default 'client' check (source in ('client','service')),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint belief_labels_state_ref_matches
    check (state_ref = 'beta:' || category || '.' || daypart || '.' || day_type)
);
comment on table public.belief_labels is
  'P9 (ADR-0013): FR-41/FR-33 correction labels on Beta cells. Materialised from belief_label events by trigger (id = event op_id); delivered to the RecSys /labels endpoint by the sync-resolve reward pass; the latest label per cell is in force. Clients read their own rows only.';
create index belief_labels_user_idx on public.belief_labels (user_id, labeled_at);
create index belief_labels_undelivered_idx on public.belief_labels (user_id)
  where delivered_at is null;

alter table public.belief_labels enable row level security;
revoke all on public.belief_labels from anon, authenticated;
grant select on public.belief_labels to authenticated;
create policy belief_labels_select on public.belief_labels for select
  using ((select auth.uid()) = user_id);

-- events (type = 'belief_label', payload {state_ref, label}) → belief_labels row
create or replace function public.tg_materialise_belief_label() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ref text := new.payload->>'state_ref';
  v_label text := new.payload->>'label';
  v_parts text[];
begin
  if new.type <> 'belief_label' then
    return new;
  end if;
  if v_ref is null or v_ref !~ '^beta:[a-z]+\.[A-Z]{2}\.[a-z]+$' then
    raise exception 'belief_label: malformed state_ref %', v_ref using errcode = '22023';
  end if;
  if v_label is null or v_label not in ('correct', 'incorrect', 'none') then
    raise exception 'belief_label: unknown label %', v_label using errcode = '22023';
  end if;
  v_parts := regexp_split_to_array(substr(v_ref, 6), '\.');
  insert into public.belief_labels (id, user_id, category, daypart, day_type, state_ref, label, labeled_at)
  -- a device clock ahead of real time must not freeze the cell's decay (energy.py clamps Δt ≥ 0)
  values (new.op_id, new.user_id, v_parts[1], v_parts[2], v_parts[3], v_ref, v_label, least(new.client_ts, now()))
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.tg_materialise_belief_label() from public, anon, authenticated;

create trigger events_belief_label after insert on public.events
  for each row when (new.type = 'belief_label')
  execute function public.tg_materialise_belief_label();
