-- P8 adversarial follow-ups (fresh-context pass, 2026-08-28 — p8-manual-verification.md §4):
-- (#10) the OAuth consent round trip is bound to the device that started it: the callback
--       stores the tokens UNCONFIRMED with a one-shot confirm token that only the redirected
--       app receives; `gcal-connect {action: confirm}` (user JWT + token) activates the
--       connection. A consent obtained by phishing another person lands on a row the confirming
--       JWT does not own → purged. A connection counts as connected only with confirmed_at.
-- (#9)  recommendation_status payloads now carry user_id (the client stamps it so the engine can
--       attribute the op to an identity after a deferred wipe); the RPC rejects a foreign one
--       like every other op type.
alter table public.gcal_sync_state
  add column confirmed_at timestamptz,
  add column confirm_token text,
  add column confirm_token_expires_at timestamptz;
comment on column public.gcal_sync_state.confirmed_at is
  'P8 adversarial #10: set by gcal-connect {confirm} from the device that started the consent; the sweep and status treat NULL as not connected even when a refresh token exists.';

create or replace function public.sync_apply_rec_status(p_user_id uuid, p_op_id text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_status text := p->>'status';
  cur public.recommendations%rowtype;
  nxt public.recommendations%rowtype;
begin
  if p->>'user_id' is not null and (not public.sync_is_uuid(p->>'user_id') or (p->>'user_id')::uuid <> p_user_id) then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'foreign user_id');
  end if;
  if not public.sync_is_uuid(p->>'id') then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'bad id');
  end if;
  if v_status is null or v_status not in ('accepted', 'pinned', 'moved', 'rejected') then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'status not client-writable');
  end if;
  v_id := (p->>'id')::uuid;
  select * into cur from public.recommendations r where r.id = v_id and r.user_id = p_user_id;
  if not found then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'rejected', 'detail', 'recommendation not owned or unknown');
  end if;
  if cur.status not in ('shown', 'accepted', 'pinned', 'moved', 'rejected') or cur.attributed_at is not null then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'superseded', 'detail', 'server status ' || cur.status);
  end if;
  if cur.status = v_status then
    return jsonb_build_object('op_id', p_op_id, 'outcome', 'applied', 'version', cur.version,
                              'server_seq', cur.server_seq, 'updated_at', cur.updated_at);
  end if;
  update public.recommendations set status = v_status where id = v_id returning * into nxt;
  return jsonb_build_object('op_id', p_op_id, 'outcome', 'applied', 'version', nxt.version,
                            'server_seq', nxt.server_seq, 'updated_at', nxt.updated_at);
end $$;
