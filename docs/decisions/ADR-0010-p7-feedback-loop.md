# ADR-0010 — P7 feedback loop: facts, attribution, rewards, blend, duration estimator

- **Date:** 2026-08-27
- **Status:** accepted
- **Phase:** P7
- **Spec anchors:** specs/07 §3.2.1 (Beta decay), §3.2.6 (blend), §3.4.1–3.4.2 (outcome table,
  attribution windows), §3.5 (two-phase pipeline, rebuild), §3.6 (rungs), §5 `/feedback`,
  Appendix A rows marked P7; File 05 §1 (forgiveness loop) and §2 (facts beat plans); File 02
  FR-23/25/30/31/32, UC-04/06/07; File 06 §1.4 (PAR anchors); spec-conflicts H2, H3, L11, L19;
  ADR-0007 §6/§12/§14; ADR-0008 §5/§7

## Context

P7 closes the loop the earlier phases prepared: the client must log the facts of a day (sessions,
completions, skips, moves, lapses, corrections, ratings), a server-side authority must turn facts
into reward tuples at the right time, and the service must learn from them — Sherman–Morrison on
the bandit (built in P5), decayed Beta evidence (P5), the blend weights (this phase) — and rebuild
on correction. Sync (P8) does not exist yet, so the instant phase needs a bridge. Every Appendix A
row marked "P7" is fixed here. Where the specs are silent the choice is marked **[INFERRED]** and
justified; the decision rule is CLAUDE.md's (defensibility › spec consistency › measurability ›
pragmatics).

## Decisions

1. **Appendix A P7 rows — accepted as proposed**, pinned across the boundary
   (`packages/shared/src/params.ts` ⇄ `supabase/functions/_shared/params.ts` ⇄ `params.py`,
   `params_test.ts`): slot start grace **±15 min** (PAR anchor, single source with the study code —
   H2); partial reward **r = f**, off-slot **0.3**, override **0.1 / 0.7**; correction window
   **7 days**; **(A, b) forgetting: none** in v1 (Beta decay carries non-stationarity); duration
   estimator **EWMA α = 0.3** per (user, category); blend init **(0.7, 0.3)**, SGD lr **0.05**;
   attribution cron **every 15 min** over timezones; rung-2 thresholds **S+F > n₀** per cell,
   badge off at **50 % of active cells**.

2. **Facts vocabulary (client → server, `events.type`).** `focus_start / focus_pause /
focus_resume / focus_end` (FR-30; `focus_end` carries `outcome`, `started_at`, `ended_at`,
   `focused_ms`, `planned_minutes`, `est_minutes`), `task_completed` (`done_at`, `source`
   block|inbox|focus), `block_skipped`, `block_moved` (both slots + distance — FR-32 reschedule
   distance), `lapse_observed` (the client's lazy mark), `lapse_corrected` (UC-04 A1),
   `session_rated` (FR-31, a label — never a reward, §3.4), `skip_diagnostic` (UC-04 A2).
   Payloads are categorical/numeric only (NFR-S3; tested). **[INFERRED]** File 05 §1 logs a
   lapse as "type=skip"; P7 keeps `lapse_observed` and `block_skipped` distinct so the
   pre-registered PAR code (H2) and outcome rows 5/6 can never be confused (spec-conflicts L26).
   A focus finish logs `focus_end` only, not a second `task_completed`: the session decides the
   in-window question (decision 4), a duplicate completion fact would let a late-started session
   masquerade as row 1.

3. **Two phases, one mapping.** `supabase/functions/_shared/rewards.ts` is the pure facts→tuples
   function (rows 1–9, corrections, idempotency); `attribute-rewards` orchestrates it in two
   modes. **Instant** (rows 1–3, 6, 8–9, corrections, the duration estimator) runs when the client
   pushes facts (user JWT) — and, from P8, when `sync-resolve` replays ops (backend key +
   `user_id`, same module). **Daily** (rows 4–5) is the 23:55-local authority: pg_cron every
   15 min → `attribution_sweep_tick()` → pg_net POST with the backend key from Vault (no-op until
   the owner stores the secrets) → `attribution_due(p_now)`. **The day boundary lives in SQL**
   (`timezone(profile.tz, now) ≥ slot-day 23:55`) so pgTAP proves the DST behaviour (Europe/Kyiv
   fall-back and spring-forward, a second zone in the same sweep). The mapping re-checks the
   instant rows in daily mode, so facts that synced late still get their instant reward instead of
   a lapse. A same-day out-of-window completion seen by the instant path is **not** rewarded early
   (spec-literal: row 4's timing is the attribution job).

4. **In-window.** A session belongs to its block when `|started_at − slot_start| ≤ 15 min` (File 06
   §1.4). **[INFERRED]** a completion without a session (block "Done") is in-window when `done_at`
   ∈ [slot_start − 15 min, slot_end + 15 min]. Several in-window sessions add up: f = Σ focused /
   planned (UC-06 A1 partial credit is about focused time, not attempts). A finished session
   started late is a same-day completion → row 4 (0.3), consistent with PAR = 0 for it.
   Precedence: an in-window completion beats a skip logged earlier (facts beat plans).

5. **Skip has no status of its own.** The enum has `rejected` (row 7, plan review) but no
   `skipped`; a skip sets the row to `rejected` and the event type distinguishes rows 6/7
   (spec-conflicts L24). The task returns to the Inbox (FR-23) and counts a postpone (FR-32).

6. **Override = "Move…" on the row-list timeline** (ADR-0008 §7): a start-time picker snapped to
   the 15-min grid, the same paired tuples as a drag; the physical drag returns with the
   proportional timeline (P9, revisit.md) — spec-conflicts M10. **The server computes the target
   context** (bucket φ and the 17-feature snapshot) with the shared grid/bucket/feature modules
   the parity fixture pins; a-priori occupancy for the fatigue rule and feature 17 = calendar busy
   ∪ the user's other committed blocks of that day **[INFERRED]** (they are facts at move time).
   The row moves (`slot_*`, `context_bucket`, `features`), so a later outcome attaches to the
   new context (§3.4.1 note). **One override pair per placement** **[INFERRED]** (the
   `feedback_rewards (recommendation_id, kind)` key): a second move is logged, not rewarded.
   A target outside 06–24 has no bucket → no `override_in`, only the move.

7. **Correction (UC-04 A1).** With a stored `lapsed` tuple inside the 7-day window the row is
   rewritten in place (`reward = 1.0`, `reason = completed`, `corrected_at`, `source =
correction`, `delivered_at = NULL`) and re-sent with `correction = true` → the service rebuilds
   from stored tuples (invariant 6). The tuple keeps its **original `attributed_at`** so Beta decay
   stays as of the block's day. Without a stored tuple (before the daily job) the assertion is an
   instant `completed` 1.0 — spec-literal reading of "converts to completion"; PAR is unaffected
   (H2: PAR needs a session). Excluded or non-lapsed tuples are never corrected; after the window
   the fact stays in `events` and the tuple is frozen.

8. **Delivery is decoupled from attribution.** `feedback_rewards.delivered_at` (+ `source`) marks
   what `/feedback` acknowledged; both modes re-send every undelivered tuple of the user, and the
   daily sweep also visits users with a backlog. The service's id-set makes re-delivery a no-op.
   Consequence: with **no service host yet (ADR-0009)** every tuple is stored and waits — learning
   signal is late, never lost; corrections reset the marker so the rebuild still happens.

9. **Duration estimator lives in the edge function, applies to both engines.** UC-06 A2: ratio =
   focused / est_minutes of **finished** sessions (an abandoned session measures nothing),
   clipped to [0.25, 4] per sample **[INFERRED]**, EWMA α = 0.3, first sample seeds; stored in
   `duration_estimates` (service-authored, RLS select own). `plan-request` scales `est_minutes`
   by clip(ewma, 0.5, 2) once **n ≥ 3** **[INFERRED]** for BOTH engines (H1 symmetry — an input
   calibration is not a policy difference), logs `request.duration_scaled`. Invariant 1 holds:
   the client never computes it; the spec's "EFs map facts, the service applies the math" is
   about rewards and model state — the estimator is an input calibration, kept where the plan
   context is assembled. `params.py` keeps `DURATION_EWMA_ALPHA` pinned for the cross-boundary
   test.

10. **Blend weights: projected SGD, River as the oracle.** Per applied tuple one step on
    ½(pred − r)² with pred = w_E·μ + w_B·ℓ, μ = feature 15 of the stored snapshot (the cell mean
    the plan saw), ℓ = xᵀθ̂_g **before** the tuple is applied; then the exact Euclidean projection
    onto the 1-simplex (Duchi et al. 2008; closed-form for two weights). lr = 0.05. River's
    `LinearRegression` (Squared loss, gradient 2(pred − r)) reproduces the unprojected step at
    lr/2 — pinned by test, so File 03 §2.2's "River online blend weights" stays an exact statement
    about the arithmetic (spec-conflicts L23; the MABWiser pattern). Excluded tuples never touch
    the blend. **Rebuild replays the trajectory** from (0.7, 0.3) over the stored tuples in
    `attributed_at` order with a sequential θ — blend state is a pure function of the tuples like
    (A, b) and the cells. `blend_state` is written in the same transaction as the rest;
    `state_version` follows the batch (ADR-0007 §14).

11. **Rung 2 (§3.6)** is fixed as constants + helpers (`is_personal`, `learning_mode`) with
    tests; the learning-mode badge and personal-phrasing switch are P9 UI (trust surfaces).

12. **Client.** Local-only `focus_sessions` (the durable facts are the events; the row lets a
    running timer survive a restart and renders from SQLite — single source of truth) and a
    local-only `tasks.skip_streak` (UC-04 A2 counter; excluded from the op payload). Starting a
    block sets `accepted` (plan-review vocabulary, L11) and enqueues that status op; every other
    status change here (`completed`, `lapsed`, `rejected`, `moved`) is **fact-derived** and NOT
    enqueued as a status op — the fact is the op, and `attribute-rewards` writes the authoritative
    status which the bridge mirrors back (`applyServerRecommendations`). **Lazy lapse scan** on
    open/foreground (instants only — DST-safe by construction, tested across the Kyiv fall-back),
    the 23:55 job remains the authority. **Facts bridge** (`src/sync/factsPush.ts`, L19's
    pattern): drain tasks, push `event_append` ops as `events` rows through RLS
    (`ignoreDuplicates` on `(user_id, op_id)`), call `attribute-rewards` instant, mirror the
    response. Skip is a quiet secondary button, never red; a lapsed block shows a neutral caption
    and "I did it" (no guilt UI). The FR-31 rating is inline on the Focus tab, one tap counts, the
    second (difficulty) is optional, "Skip rating" always available. The focus-gradient Skia ring
    is P9 (versions.md); a plain progress bar stands in.

13. **UC-04 A2 routing.** Third consecutive skip/lapse of a task → one inline question. `too_big`
    → the task becomes splittable (the next plan can chunk it); `wrong_time` → logged (the
    affinity update is the reward path itself — the lapses already demoted the context);
    `not_important` → archived (reversible from the task sheet). "Ask me later" defers. The
    streak resets on completion or on any answer.

## Consequences

- P8's `sync-resolve` imports `_shared/rewards.ts` and calls `processUser(…, 'instant')` after
  replay; the facts bridge and the task-push bridge are deleted then (revisit.md).
- P9 adds the drag gesture on the proportional timeline, the Skia ring, the learning-mode badge
  and plan review (row 7 `block_rejected`); P10 adds `notification_response` to FR-32.
- P11 reports per-arm drop/attribution/correction rates and reads `duration_estimates` for the
  RQ2 ablations; the OSF text describes the off-slot/partial/override values as fixed here.
- Owner actions before anything learns live: the RecSys host (ADR-0009), then Vault secrets
  `hourwell_functions_url` + `hourwell_service_key` (+ optional `hourwell_anon_key`) for the
  cron tick and `RECSYS_URL`/`HOURWELL_SERVICE_KEY` for the functions (HANDOFF).
- λ_f retune (revisit, P5): needs observed q̂ scales — no live feedback exists yet; deferred to
  the first data review (P11), recorded in revisit.md.
