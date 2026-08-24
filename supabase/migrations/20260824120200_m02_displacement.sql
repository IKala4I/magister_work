-- M-02 — external-displacement statuses + conflict flag (File 03 §4; File 05 §2; UC-09)
-- displaced_pending: server marked the block displaced while the client may still hold facts;
-- displaced: displacement confirmed (task returns to Inbox; NO reward is ever emitted).
-- conflict_flag: completion arrived concurrently with an external conflict — the reward
-- context is ambiguous and the tuple is EXCLUDED from updates (never guessed).
alter table public.recommendations drop constraint recommendations_status_check;
alter table public.recommendations add constraint recommendations_status_check check (status in
  ('shown','accepted','pinned','moved','rejected','completed','lapsed','expired',
   'displaced_pending','displaced'));

alter table public.recommendations add column conflict_flag boolean not null default false;

comment on column public.recommendations.conflict_flag is
  'M-02: set when a completion and an external displacement raced (File 05 §2). Facts beat plans: the completion stands, but the reward is flagged ambiguous and excluded.';
