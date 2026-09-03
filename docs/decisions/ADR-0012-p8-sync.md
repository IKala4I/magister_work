# ADR-0012 — P8 sync: push-then-pull `sync-resolve`, conflict classes, displacement, Google Calendar

- **Date:** 2026-08-28
- **Status:** accepted (autonomous phase, CLAUDE.md "Working mode"; owner-facing items are marked)
- **Phase:** P8
- **Spec anchors:** File 05 §2 (offline-first sync, three conflict classes, facts beat plans,
  `displaced_pending`/`displaced`, 409 field-level merge); File 03 §1.2 (fact logger and
  renderer), §1.1 (feedback flow "push-then-pull sync"); specs/07 §4 conventions (`version`,
  `server_seq`, cursor = max `server_seq`), §4.1 `events` UNIQUE(user_id, op_id),
  `calendar_events`, `gcal_sync_state`, §4.3 M-02, §4.4 RLS catalog, §7; File 02 FR-03, FR-23,
  NFR-R1, UC-09; spec-conflicts L11, L19, L24, L26, H3; ADR-0006 §4 (profile bridge), ADR-0008
  §4/§5 (persist RPC, task bridge), ADR-0010 §3/§8/§12, ADR-0011 Consequences (P8 lines);
  `docs/decisions/revisit.md` P8 lines (bridges, cursor wipe, transactional persist,
  advisory lock around map+write).

## Context

P3–P7 wrote every domain change local-first into the SQLite outbox (`op_outbox`: client-
monotonic `op_id`, `base_version`, server-shaped payloads) but moved rows to the server through
three interim bridges (profile — ADR-0006 §4; tasks — ADR-0008 §5; facts + plan-review statuses —
ADR-0010 §12), all last-write-wins and none pulling anything back except the plan response and
the `attribute-rewards` mirror. P8 replaces them with the sync the specs describe: push-then-pull
against a server cursor, duplicate op replay a no-op, `base_version` checks, the three conflict
classes with **facts beat plans** as the governing domain rule, ambiguous rewards flagged and
excluded, and the external calendar that produces the semantic conflicts in the first place
(FR-03: mandatory busy import, opt-in write-back; UC-09: plan consistent ≤ 5 min after a change;
M-02 statuses). Google Cloud credentials are a human-action gate (PLAN §3), so the Google half is
code-complete and tested against a fake Google API; its live verification waits for the owner.
Where a spec is silent the choice is marked **[INFERRED]**; the decision rule is CLAUDE.md's.

## Decisions

1. **One round trip, three phases — edge function `sync-resolve` (user JWT).** Body
   `{ ops, cursor, device_id, now }`; the function (a) replays `ops` in client order inside one
   database transaction (decision 2), (b) runs the P7 instant mapping for the user
   (`processUser(deps, userId, 'instant', null)` from `attribute-rewards/handler.ts` — the same
   module, the same `_shared/rewards.ts`), (c) pulls every row with `server_seq > cursor`
   (decision 5). Response `{ acks, rewards, pull, cursor, has_more }`. The three phases run under
   a per-user lease (decision 7). `attribute-rewards` keeps its instant mode for tooling; the
   client no longer calls it. `functions.invoke` is pinned to `FunctionRegion.EuWest1` through
   one helper (`src/sync/invoke.ts`) used by every function call (ADR-0011 Consequences).

2. **Replay is one SQL transaction with per-op subtransactions — RPC `sync_replay(p_user_id,
p_ops)`,** `security definer`, executable by `service_role` only; the user id comes from the
   verified JWT, never from the body. Ledger **`sync_ops`** PK `(user_id, op_id)`: an op already in
   the ledger (or, for `event_append`, already in `events` — the P1 UNIQUE) returns `duplicate`
   and changes nothing — _duplicate op replay is a no-op_ (NFR-R1, File 05 §2). Each op runs in a
   `BEGIN … EXCEPTION` block, so one bad op cannot roll back the batch; outcomes: `applied`,
   `duplicate`, `conflict` (+ server row), `superseded`, `rejected` (ownership / vocabulary),
   `error` (unexpected — the client retries, dead-letters after 5 attempts). Every statement is
   filtered by `p_user_id`: an op naming another user's row is `rejected`, never applied
   (pgTAP). `applied` ops return the row's new `version` and `server_seq`; the engine adopts
   them on the local row when no later unacked op owns the entity (adversarial #13, done
   2026-08-29), and the pull page of the same response converges everything else (the engine
   acks before it applies the page, so the entity is no longer skipped).

3. **The three conflict classes (File 05 §2), mapped op by op.**
   - _Class 1 — `event_append`:_ append-only, never conflicts; insert `ON CONFLICT (user_id,
op_id) DO NOTHING`; referenced `task_id` / `recommendation_id` must be the user's own rows
     (the P1 RLS predicate, re-checked in the RPC), otherwise `rejected`.
   - _Class 2 — `task_upsert`, `task_delete`, `profile_update`:_ optimistic version check —
     `base_version` null = create (insert; an existing row → `conflict`), else the row's
     `version` must equal `base_version`; on mismatch the op returns **`conflict` + the server
     row** (the diagram's 409) and the client performs the **field-level merge** (decision 4),
     rewrites the op in place (same `op_id`, new payload, `base_version` = server version) and
     replays it in the next round. Applied rows keep the client's `updated_at` (the migration
     makes the touch trigger fire only when the writer did not set it — the merge needs edit
     times on both sides, spec-conflicts L30); the trigger bumps `version`.
   - _Class 3 — semantic:_ `recommendation_status` ops (only `accepted` today, L11 vocabulary
     `{accepted, pinned, moved, rejected}`) are **state-checked, not version-checked**: applied
     when the row is still in the plan-review set and unattributed, `superseded` (acked, moot)
     when a server-side transition — `completed`, `lapsed`, `expired`, `displaced_pending`,
     `displaced` — already won; any other status in the op is `rejected`. Facts versus
     displacement is resolved by the reward mapping after replay (decision 9), which is where
     **facts beat plans** lives.

4. **Field-level merge on the client (`src/sync/merge.ts`) [INFERRED, File 05 §2 "user-owned
   fields LWW"].** Tasks: user-owned fields (`title`, `category`, `est_minutes`, `deadline`,
   `value`, `splittable`, `earliest_start`, `recurrence`, `deleted_at`) follow **last-write-wins
   by `updated_at`** between the local row and the server row; fact-derived fields are
   **monotone** — `status = done` (with the earliest `done_at`) beats any non-done status,
   `archived` beats the plan-mirror statuses, `postpone_count` = max; the plan-mirror statuses
   (`inbox`/`scheduled`) follow the LWW winner. Profiles: all fields are user-owned settings →
   row-level LWW by `updated_at`. The merged row is written locally **without a new op** (the
   rewritten op carries it) so the outbox never grows from a conflict; every other unacked op of
   the same entity **collapses** into the rewritten one (full-row payloads make the newest state
   the whole history); a second conflict needs a second concurrent server write, so the loop is
   bounded by construction (3 rounds per sync).

5. **Pull — RPC `sync_pull(p_cursor, p_limit)`,** `security invoker` under the user's RLS (one
   more bug class made impossible: the pull cannot leak another user's row even with a broken
   filter): `UNION ALL` of `profiles`, `tasks`, `plans`, `recommendations`, `calendar_events`
   ordered by `server_seq`, one limit → **one cursor** (`max server_seq` seen, max-semantics in
   MMKV — `src/sync/cursor.ts`), `has_more` when the page was full. The client applies a page in
   **one SQLite transaction**: upsert by primary key; rows whose entity has an **unacked local
   op are skipped** (the next push resolves them through decision 3/4 — pushing first is what
   makes this safe); a pulled **final** `displaced` recommendation mirrors its task back to the
   Inbox (status only — a displacement is not the user's postponement, so `postpone_count` and
   the local `skip_streak` stay; through the outbox like every task write); a pulled
   `displaced_pending` leaves the task alone and renders as an overlap that "still counts if you
   do it" — the block may be in a focus session (adversarial #4); a pulled
   `conflict_flag = true` row surfaces the File 05 §2 toast ("Meeting imported — your completed
   session is kept"). **`events` are not pulled** [INFERRED]: no screen reads another device's
   raw facts (the lapse scan reads local `focus_sessions`; P9's review reads server aggregates),
   and the append-only log is the largest table. Server-side soft deletes make deletions
   converge: `calendar_events.deleted_at` is added for cancelled meetings (same reasoning as
   `tasks.deleted_at`, specs/07 §4.1).

6. **The engine replaces the bridges (`src/sync/engine.ts`; `factsPush.ts`, `taskPush.ts`,
   `profilePush.ts` deleted — revisit L19/ADR-0006 §4/ADR-0008 §5).** Single-flight; batches of
   ≤ 200 ops in `seq` order filtered to the signed-in uid (ops of another identity stay queued —
   decision 11); triggers: app foreground, 2 s after any local write (debounced), network
   reconnect (`expo-network` listener), a 60 s poll while foregrounded, and **before every
   plan request** (the server must plan from the same day the device sees — ADR-0010 §12; the
   pre-plan sync is skipped when nothing is pending and the last pull is < 30 s old). Ops that
   return `error` count an attempt; after 5 the op is **dead-lettered** (acked with
   `last_error`, reported to Sentry) so one poison op cannot block the queue [INFERRED]; a
   `conflict` never counts. After a plan is mirrored, `applyPlanResponse` stays as it is — the
   pull would bring the same rows and is idempotent on the plan id. Invocation budget (invariant
   11): the 60 s poll is ≈ 60 calls per active hour per device; at study scale (< 100 users,
   ~1 h/day) that is < 10 % of the free tier's 500 k invocations/month — P12 re-checks.
   Hardening from the adversarial pass (#5–#8, #13, done 2026-08-29): one debounced retry on
   `busy` (never a loop), a > 200-op backlog drains within one sync (bounded by `MAX_ROUNDS`),
   an error boundary in `run()`, an entity is re-read after a dead-letter, `ack.version` /
   `server_seq` are adopted locally.

7. **Per-user lease around replay + mapping (`sync_leases`, RPCs `acquire_sync_lease` /
   `release_sync_lease`, TTL 30 s, service-only)** — the concrete answer to revisit
   "P8: move map+write into one RPC": the mapping stays in TypeScript (moving `rewards.ts` into
   plpgsql would fork the reward logic), but `sync-resolve` and the daily sweep serialise per
   user through a lease with a TTL (a crashed holder cannot wedge the user). `sync-resolve`
   answers `409 busy` while another sync of the same user holds it (the client reports `busy`
   and the next trigger retries). **Every server-side writer of a user's rows holds the lease**
   (adversarial #1/#14): the daily sweep skips a leased user for that tick (`skipped_busy`),
   `attribute-rewards` instant mode answers 409, plan persistence and the calendar sync run
   under `withLease` (wait ≤ 3 s, then proceed and log — the residual for the `server_seq`
   commit-order hole). Independently of the lease, every recommendation patch is a
   **compare-and-set** on the status the mapping read (`expected_status`), so a lost race is a
   no-op, never an overwrite; `gatePatches` (ADR-0010 §3) stays as defence in depth.

8. **`persist_plan` RPC (revisit ADR-0008 §4):** plan row + recommendation rows + supersede in
   **one transaction**, `security definer`, service-only; `persist.ts` calls it and the
   compensating delete is gone. Same return shape (`plan`, `recommendations` in slot order,
   `expired_recommendation_ids`).

9. **Displacement semantics (M-02, File 05 §2, spec-conflicts H3).** The webhook marks an
   **open** recommendation (`shown`/`accepted`/`pinned`/`moved`, `slot_end > now`) overlapping
   a newly imported **busy** interval `displaced_pending` — the state that exists precisely
   because the device may still hold facts offline. Resolution lives in the reward mapping so
   both phases apply it identically: with completion evidence (row 1/2 in-window completion or a
   qualifying session) the row becomes **`completed` with `conflict_flag = true`** and the
   tuple is written **`excluded = true, excluded_reason = concurrent_external_conflict`** (the
   ambiguous reward — H3: a row with its value, never an update); without evidence, once the
   slot can no longer be resumed (`now > slot_end + 15 min`) or in daily mode, the row becomes
   **`displaced`** and **no tuple** is written (external displacement emits no reward — H3 "no
   row at all"); before that instant it stays pending. `attribution_due` therefore includes
   `displaced_pending`. A cancelled meeting does **not** un-displace [INFERRED — File 05 §2:
   "replacement suggested at next planning event"]; a displaced row is never displaced again.
   Rows already past their slot are left alone (the past is facts, not plans). `pinned` blocks
   are displaced like `shown` ones — an external meeting outranks the user's pin the same way it
   outranks the planner's placement [INFERRED]. A single displaced chunk moves the whole task to
   the Inbox (the P6 mirror is per task; revisit.md).

10. **Google Calendar (FR-03, UC-09) — server-held OAuth, minimal scopes, push + sweep.**
    - _Connect:_ `gcal-connect` (user JWT) `start` returns Google's consent URL (authorization
      code + `access_type=offline` + `prompt=consent`, `state` = one-shot nonce bound to the uid
      in `gcal_sync_state`, 10-min expiry); the browser lands on `gcal-callback` (no JWT — Google
      redirects there), which exchanges the code **server-side** with the client secret, stores
      the refresh token in `gcal_sync_state` (a server-only table: no grants, no policies —
      specs/07 §4.4; **the refresh token never reaches the device**), runs the initial full sync
      (timed events from now − 1 d to now + 14 d [INFERRED window]; the sync token then covers
      the calendar), opens the push channel, and redirects to `hourwell://gcal-callback`.
      Works for magic-link and anonymous users alike — connecting a calendar is not signing in
      with Google. **The consent is bound to the device that started it** (adversarial #10):
      the callback stores the tokens unconfirmed and puts a one-shot confirm token only into
      the redirect; `gcal-connect {confirm}` under the starting account's JWT activates the
      connection and runs the initial sync, any mismatch purges the tokens. The initial full
      sync restricts by `timeMin` (yesterday) only — the sync token inherits the initial
      request's filters, so a `timeMax` would silently end the feed (adversarial #2).
      `disconnect` deletes the mirrored `Hourwell ·` events while it still holds a token, stops
      the channel, revokes the token, deletes the state and tombstones the imported events.
    - _Scopes:_ import = `calendar.events.readonly`; enabling write-back asks once more for
      `calendar.events` with `include_granted_scopes=true` (incremental authorization) — the
      write scope is never requested from users who did not opt in.
    - _Import mapping [INFERRED from the API fields]:_ timed events → `calendar_events` with
      `busy = (transparency ≠ 'transparent')`; all-day events (`start.date`) only when opaque
      (Google's default for all-day events is free); `status = cancelled` → `deleted_at`; own
      write-back events (`extendedProperties.private.hourwell`) are skipped; titles are stored
      for display only (specs/07 §4.1; never exported).
    - _Consistency (UC-09 ≤ 5 min):_ the push channel (`events.watch`, `ttl` 7 d, per-user
      `token` checked on every notification) delivers within seconds; a pg_cron **sweep every
      5 minutes** (`gcal_sweep_tick()` → `gcal-webhook` `mode: sweep` with the Vault-held key,
      same pattern as the attribution tick) renews channels with < 24 h left, re-syncs every
      connected user whose `last_synced_at` is older than 5 min, and re-runs write-back — so the
      bound holds server-side even with push broken. `410 Gone` → wipe the mirror, full resync.
      The **client** learns the new state at its next foreground/poll (invariant 7: no
      correctness depends on background execution); "≤ 5 min" is a server-side statement.
    - _Write-back (opt-in):_ open blocks of the plan day and the next day are mirrored into the
      user's primary calendar as `Hourwell · <title>` events keyed by
      `extendedProperties.private.hourwell = <recommendation_id>`; every block that leaves the
      open set (completed, lapsed, rejected, expired, displaced) deletes its event, and switching
      the write-back off removes all of them. The user's own calendar is the user's data —
      NFR-S3 governs the ML boundary, not this mirror.

11. **Deferred wipe on account change (revisit P4, cursor contract).** When a _different_ uid
    signs in and the previous uid still has unacked ops, the mirror is **not** wiped: the cursor
    resets (the new account pulls from 0), rows stay namespaced by `user_id` (screens already
    filter by `currentUserId()`), the engine pushes only the signed-in uid's ops, and a calm
    banner offers **Discard** (wipe that identity's rows and ops now) or **Keep** (rows stay
    namespaced; the question is not asked again). The previous account signing back in cancels
    the pending wipe and pushes its ops; if its ops were meanwhile all acked, the rows are
    dropped silently at the next sign-in. Without unacked ops the wipe stays immediate (privacy
    default).

12. **ADR-0011 items for P8:** the region pin (decision 1); `profiles.eu_eea_resident boolean`
    (null = not asked; the yes/no question is asked by P11's study-mode enrollment, not by
    onboarding); the consent-form clause drafted with the FR-42 texts in
    `docs/privacy/consent-clause.md`; Google is recorded in the privacy README as an
    **independent controller** of the user's calendar with our function as its OAuth client
    (tokens at rest in the EU database), not as a processor.

13. **Schema additions (migration `p8_sync`):** `sync_ops`, `sync_leases`, `gcal_sync_state`
    columns (`refresh_token`, `access_token`, `access_token_expires_at`, `calendar_id`,
    `channel_token`, `oauth_state`, `oauth_state_expires_at`, `scope`, `write_back`,
    `write_back_calendar_id`, `last_synced_at`, `last_error`, `connected_at`),
    `calendar_events.deleted_at`, `profiles.eu_eea_resident`, the four RPCs, `attribution_due`
    incl. `displaced_pending`, `gcal_sweep_tick()` + cron `gcal-sweep` (`*/5 * * * *`). No
    ledger retention in v1 (volume: tens of ops per user-day).

## Addendum 2026-09-03 (hardware pass, day 3) — the pre-plan sync skips the instant reward pass

Measured from a Node client against the hosted function (`docs/verification/hw-sync-hops.mjs`):
`sync-resolve` with zero ops costs p50 533 ms as a bare `poll` and p50 844 ms as `pre_plan` — the
instant reward pass (`processUser`, mode `instant`: its own reads, and a VM round trip whenever
tuples are pending) is ≈ 0.3–0.4 s of it; the phone adds ≈ 0.45 s of transport, so a pre-plan
sync is ≈ 1.4 s of the user's wait for a plan (day-3 notes, NFR-P1 decomposition). The plan
request needs the pushed **facts and statuses** — which the replay writes — not their reward
attribution, and the ops a pre-plan push carries are mostly the plan mirror's own
`recommendation_shown` events. **Decision:** `shouldRunRewards` returns false for `pre_plan`;
the next `foreground` / `reconnect` / `manual` sync, or the 23:55 attribution authority, runs the
pass. Invariant 7 (lazy lapse, 23:55 authority) is unchanged; the only effect is that a plan
requested within seconds of a completion is computed on cells one delivery behind. Not changed:
the hop structure (lease → replay → pull → release) and the push-before-plan rule of ADR-0010
§12 — collapsing the hops or carrying the ops inside the plan request are optional optimisations
recorded in revisit.md ("Pre-plan sync cost").

## Rejected

- **Server-side LWW without a 409** (apply the op when its `updated_at` is newer): fewer round
  trips, but File 05 §2 shows the 409 + client merge explicitly, and the client is the only place
  that knows which fields the user just touched.
- **Supabase Auth Google provider with calendar scopes** (tokens from `signInWithOAuth`):
  couples calendar access to the sign-in method (FR-01 has magic-link and anonymous users),
  hands the refresh token to the device, and Supabase does not persist provider refresh tokens.
- **Polling only** (no push channel): simpler, but a 5-min poll for every connected user is the
  fallback, not the primary path; push is what makes "seconds" typical.
- **`calendar.events.freebusy` as the import scope**: attractive (titles never leave Google)
  but its interaction with sync tokens and push channels is not documented; revisit if the
  verification review asks for a narrower scope.
- **Moving the reward mapping into plpgsql** for a single transaction (revisit note): would fork
  `rewards.ts`; the lease gives the same serialisation.

## Consequences

- Acceptance (PLAN §3): duplicate-op no-op — pgTAP `p8_sync_test.sql` (replay twice) + Deno
  handler test + jest engine test; **File 05 §2 reproduced end-to-end incl. the counterfactual
  branch** — `sync-resolve/scenario_test.ts` chains the webhook (displacement) and the sync
  (ops 41/42 → `completed` + `conflict_flag` + excluded tuple; no ops → `displaced`, no tuple),
  and `docs/verification/p8-live-smoke.mjs` runs the same scenario on the hosted project with the
  displacement injected by the service role (the Google hop is gated); offline→reconnect —
  adversarial pass + device checklist (real radios).
- Spec-conflicts: L19 closed (bridges gone); new lines for the pull set, the deferred wipe and
  the displacement resolution timing; thesis-corrections for the "≤ 5 min" claim wording.
- Owner gate (⛔): Google Cloud project, Calendar API, OAuth client (web type, redirect =
  `<functions-url>/gcal-callback`), consent screen with the two calendar scopes; secrets
  `GCAL_CLIENT_ID`, `GCAL_CLIENT_SECRET`, `GCAL_WEBHOOK_BASE`; the app must be **in production**
  (unverified is fine up to 100 users) before enrollment — in "Testing" status Google expires
  refresh tokens after 7 days, which would silently disconnect every participant mid-study.
- P9/P10: the timeline renders busy rows now; a proportional canvas (revisit P6) can reuse them.
  P10's notifications must not assume sync ran in the background. P11: `eu_eea_resident`
  question in enrollment; `erase_user` RPC must also revoke the Google token.
- Revisit lines closed by this ADR: task-push bridge, facts bridge, cursor-wipe confirm,
  transactional persist, map+write serialisation.
