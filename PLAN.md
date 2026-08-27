# PLAN — Hourwell (internal codename: Kairos)

> Source of truth: `specs/01–06` (read-only), plus `specs/07_engine_internals_and_schema.md` once
> approved (see Decisions). This plan restates the system, fixes the repo layout, and maps phases
> to requirement IDs. Approved 2026-08-24 with the decisions recorded in §5.

---

## 1. System Restatement (one page)

**Product.** Hourwell is a mobile planner that treats daily scheduling as a constrained
recommendation problem: rank (task, time-slot) assignments by _learned personal completion
probability_, solve the assignment under hard calendar constraints, explain every placement in one
sentence, and learn from every outcome. Three promises: believable plans, zero-guilt adaptation,
legible intelligence (File 02 §2).

**Four tiers, one loop:**

1. **Mobile client — React Native + Expo (TS strict).** Expo SDK 54+, New Architecture, Expo
   Router, Zustand (ephemeral UI only), Expo SQLite + Drizzle as the single reactive source of
   truth, an op outbox for offline-first sync, MMKV for the sync cursor, chrono-node for on-device
   NL quick-add, Reanimated/Gesture Handler for drag-to-teach, Skia for the heatmap and timer ring.
   The client is a **fact logger and renderer**: it never computes rewards and never touches model
   state (File 03 §1.2).

2. **Supabase (EU) — Postgres 16 + RLS, Auth, Edge Functions, pg_cron.** System of record.
   Edge Functions: `plan-request` (JWT validation, context assembly, **heuristic fallback NFR-R2
   lives here** so a sleeping ML container never blocks the user), `attribute-rewards` (23:55 local
   end-of-day authority), `sync-resolve` (push-then-pull sync; domain rule: **facts beat plans**;
   ambiguous rewards flagged and **excluded**, never guessed), `gcal-webhook` (external
   displacement; **no reward emitted** on displacement).

3. **RecSys service — FastAPI (Python 3.12) on Hugging Face Spaces free CPU.**
   `/plan`: feasible-start precompute → context bucketing φ (daypart × day-type ×
   relative-position, |C| ≈ 12–18) → per-(task, bucket) completion estimates from Beta-cell energy
   model + LinUCB/TS linear state → **one Thompson posterior sample, one CP-SAT solve** with
   bandit-supplied objective weights, AddHint warm start (anti-thrashing), 1.5 s anytime cap,
   degradation ladder. Budgeted ε-exploration: one non-critical placement drawn uniformly from its
   top-m=4 buckets, pinned into the solve, **exact propensity p = ε/m logged** on the
   recommendation row (M-01), rendered as an "experiment" (FR-22).
   `/feedback`: two-phase — instant signals update Sherman–Morrison rank-1 + decayed Beta counts
   (half-life 28 d) immediately; lapses finalized once per local day; corrections trigger a full
   **rebuild from stored reward tuples, never a downdate**.

4. **Training pipeline — GitHub Actions nightly.** Pseudonymized categorical export (never raw
   task text, NFR-S3) → ALS cross-user priors + cluster re-fit → eval gate → HF Hub + `model_registry`.
   Cold start: rMEQ 5-item survey → chronotype class → prior mean matrix → logit-affine category
   transform → Beta priors (n₀ = 8 in-hours / 4 out / halved on skip; weekend blend rule), class
   doubles as seed ALS cluster; fold-in after ≥30 outcomes; **priors never overwrite evidence**.
   OPE harness (File 04 §2): replay on the randomized slice only, IPS/clipped/SNIPS/DR with
   ESS < 100 treated as non-evidence — this powers the thesis evaluation (File 06).

**Offline-first contract (NFR-R1).** All domain writes land in local SQLite first; the outbox
holds ordered ops with client-monotonic `op_id` and `base_version`; sync is push-then-pull against
a server cursor. Events are append-only and never conflict; plain rows use optimistic version
checks; semantic conflicts go to `sync-resolve` domain rules.

**Evaluation (File 06).** ABAB within-subject field study, N = 30 completers; arm A is the NFR-R2
heuristic promoted to primary with pixel-identical UI and template rationales; the ε-slice is a
nested micro-randomized trial. Engineering consequence: condition flags and arm-switching must be
first-class, and every recommendation event carries model version + feature snapshot (NFR-O1).

---

## 2. Repo Layout (proposed — one monorepo)

```
apps/mobile/            Expo SDK 54+, RN New Arch, TS strict, Expo Router, Drizzle + expo-sqlite,
                        MMKV, Zustand, Reanimated 4, Skia, chrono-node, expo-notifications
services/recsys/        FastAPI (Python 3.12, uv), OR-Tools CP-SAT, NumPy LinUCB/TS, River,
                        implicit (training-side), pydantic v2; Dockerfile for HF Spaces
supabase/               config.toml, migrations/, functions/{plan-request, attribute-rewards,
                        sync-resolve, gcal-webhook}/ (Deno/TS), seed.sql
packages/shared/        generated types only + tiny hand-written constants shared by client and
                        edge functions (context-bucket enums, event names). Two generated files:
                        database.ts (supabase gen types) and api.ts (openapi-typescript from the
                        FastAPI spec). CI fails if regenerated output differs from committed.
training/               nightly pipeline (uv): export → ALS/cluster fit → eval gate → registry
                        push; ope/ (replay, IPS/SNIPS/DR, ESS) as an importable, tested package
docs/                   traceability.md, decisions/ (ADRs), versions.md, naming.md, privacy/
.github/workflows/      ci.yml (TS + Python gates, contract sync), train.yml (nightly),
                        deploy-recsys.yml (push services/recsys subtree to the HF Space)
```

**Justifications / deltas from the prompt's sketch:**

- **Monorepo** (recommended, pending Q2): the end-to-end shared type system (File 03 §1.1 "note on
  shared types") only stays honest if schema, OpenAPI spec, generated types, client, and edge
  functions version together — CI diffs generated vs. committed types in one place.
- **No Nx/Turbo.** Two TS workspaces and two Python packages don't earn a build-cache layer;
  plain npm-style workspaces + per-workspace CI jobs. Revisit only if CI time hurts.
- **Edge functions consume `packages/shared`** via a relative import path vendored at deploy time
  (Deno can import bare .ts files); the mechanism is pinned in P1.
- **Python side** uses `uv` with `pyproject.toml` per package and a shared ruff/mypy config;
  MABWiser appears only as a dev-dependency test oracle (File 03 §2.2).
- `deploy-recsys.yml` added: HF Spaces deploys by git push of the service subtree; keeping it out
  of `ci.yml` keeps PR runs fast.

---

## 3. Phase Plan

Every phase ends with: requirement-checklist table, adversarial pass (fresh-context subagent),
all gates green with pasted output, traceability + CHANGELOG + `docs/thesis/pojasnennia.uk.md` +
`docs/HANDOFF.md` updated, manual verification script, PR `phase/Pn-<name>` opened and merged
autonomously once green (owner directive 2026-08-24 — stop conditions in CLAUDE.md "Working
mode"). Cross-cutting from P2 onward: NFR-A1/A2 respected in all new UI; every new table ships
with RLS + a bypass test (NFR-S1).

**Status board:** P0 ✅ merged (PR #1) · P1 ✅ merged (PR #2) · P2 ✅ merged (PR #3; carry-over measurements done — NFR-P2 p90 = 1075 ms and NFR-A2 sweep 27/27, both on the iOS **simulator**: threshold met, device condition not — device re-check on the checklist below) · P3 ✅ merged (PR #4; adversarial pass found 3 MAJORs, all fixed + re-verified on the iOS **simulator**, Release build — see `docs/verification/p3-manual-verification.md`) · P4 ✅ merged (PR #5; cold-start math verified 3 ways incl. live smoke on the hosted project; adversarial pass: 1 MAJOR session-fixation + 10 MINOR, all fixed — `docs/verification/p4-manual-verification.md`; ⛔ open: Google OAuth consent screen, mailbox magic-link E2E) · P5 ✅ merged (PR #6; FastAPI service + CP-SAT planner per File 04 §1, exact ε-slice propensity, H3-distinct reward paths; adversarial pass: 2 MAJOR (top-m over chunk-only buckets → biased slice; excluded correction never rebuilt) + 11 MINOR, all fixed — `docs/verification/p5-manual-verification.md`; timing measured on a Mac only, 2 vCPU Space pending; ⛔ open: HF Space creation) · P6 ✅ merged (PR #7; `plan-request` edge function + arm A "heuristic + matched randomization" on TypeScript mirrors of the service pinned by a parity fixture; eligibility |A_m(x)| ∈ {2,3,4} with exact per-row propensity (owner decision, rate measured); Today screen; adversarial pass — see `docs/verification/p6-manual-verification.md`; learned path live + NFR-P1 warm p95 pending the HF Space) · P7 ✅ merged (PR #8; feedback loop end to end minus a live service: `attribute-rewards` EF with instant + 23:55-local daily modes (boundary in SQL, DST pgTAP-tested), stored-then-delivered tuples, blend SGD with River as oracle, duration estimator, Focus tab + block actions + lazy lapse scan + third-skip diagnostic; 290 jest + 98 Deno + 135 pytest + 32 pgTAP; adversarial pass 7 MAJOR + 14 MINOR, all MAJORs fixed; ⛔ open: RecSys host decision — ADR-0009 — after Hugging Face withdrew free Docker Spaces; Vault secrets for the cron tick) · **P7.1** RecSys hosting (ADR-0009 accepted: Oracle Always Free A1 in eu-marseille-1; deploy bundle + pull-based GHCR rollout + runbook + privacy/DPIA update; owner steps ⛔ 1–7 in HANDOFF, then the three measurements; **ADR-0011** Chapter V transfer analysis proposed for owner decision — claim-level, not deferred to P11) · P8 opens next.

> **Simulator ≠ device (owner directive 2026-08-26, CLAUDE.md "Simulator evidence").**
> Device-conditioned requirements flip to ✅ only at the owner-run **hardware verification
> pass before P12** (one physical iPhone + one physical Android). The running list of what
> that pass must cover is `docs/verification/device-checklist.md` — every phase adds its
> entries as it goes.

**P0 — Bootstrap.**
Monorepo scaffolding (pnpm + Node 22 LTS pinned via `.nvmrc` + `packageManager`; `expo-doctor`
compat check — fall back to npm workspaces without asking, recorded as an ADR), TS strict base
config, ESLint 9 flat + Prettier, Jest 30 skeleton, uv + ruff + mypy + pytest skeleton, `ci.yml`
running all gates, commit `specs/` + `.gitignore` (commit convention applies from the very first
commit), secret audit (`.env` ignored ✔, no secrets in history ✔), `docs/` seeded (versions.md
with verification dates, naming.md, traceability skeleton, ADR template), CLAUDE.md.
**Write `specs/07_engine_internals_and_schema.md`** — one reviewable document reconstructing the
superseded v1.0 content: §4 base schema (M-01/M-02 as migrations on top, not baked in), §3.2
engine stages incl. LinUCB/TS feature vector + Beta-cell definitions, §3.4 reward shaping &
attribution (load-bearing — most care), §3.5 feedback details, §3.6 cold-start rungs, §5 API
request/response schemas, §7 security/privacy specifics. Everything derived from Files 01–06;
inferred choices marked `[INFERRED]` with reasoning; open numerics get proposed defaults + the
phase where each is fixed. **Gate: your approval of 07 before P1 opens; it then joins `specs/` as
read-only truth.**
**Make the repo public at end of P0**, right after the secret audit (never rely on privacy as a
secrets control).
_Accept:_ CI green; history clean of secrets; versions pinned; 07 delivered for review.
_(No FR yet; serves NFR-M1 groundwork.)_

**P1 — Data layer.**
Postgres schema + RLS on every table + migrations including **M-01** (`recommendations.propensity
real`) and **M-02** (`displaced_pending` status + `conflict_flag`); pg_cron scaffolding; type
generation into `packages/shared`; seed script.
_Accept:_ migrations apply to the linked EU (Ireland) project via `supabase db push` (one-time
CLI login = ACTION REQUIRED gate); RLS bypass attempt with a second user's JWT returns zero rows
(tested); generated types committed and CI-diffed; **PostHog confirmed on its EU instance and
documented** (NFR-S2 names both). → NFR-S1, NFR-S2, M-01/M-02, FR-42 groundwork (ON DELETE
CASCADE paths).
_Schema source: approved `specs/07` §4._

**P2 — Mobile shell.**
Expo app (name Hourwell, `com.hourwell.app`), Expo Router tab shell (Today · Inbox · Focus ·
Insights + Settings), design tokens from File 02 §3 (palette incl. dark, Inter Variable + JetBrains
Mono scale, radii, motion ≤250 ms springs, reduced-motion honored, **confidence = solidity**
styling primitives), local SQLite + Drizzle schema mirroring P1 + op outbox tables + MMKV cursor,
Zustand for ephemeral UI, Sentry crash reporting; i18n scaffolding (expo-localization + typed
string catalog) — English strings only, **no hardcoded user-facing strings in components from P2
onward** (ESLint rule if cheap, else review checklist).
_Accept:_ cold start ≤2 s p90 measured on device (NFR-P2); token snapshot tests; 200% font scale
and reduced-motion pass on the shell (NFR-A2). → NFR-P2, NFR-A2, NFR-O1 (crash half), File 02 §3.

**P3 — Tasks.**
Task CRUD with all FR-10 fields; chrono-node NL quick-add with preview chip + disambiguation
(FR-11, UC-02); offline-first writes through the outbox (NFR-R1); `task_created` events; PostHog
event plumbing.
_Accept:_ NL-parse mapping test suite (durations, deadlines, "by Fri", ambiguity); create/edit/
delete fully offline then sync-queue verified; domain coverage ≥70%. → FR-10, FR-11, UC-02, NFR-R1
(local half), NFR-O1.

**P4 — Onboarding.**
Auth: magic link + Google OAuth + anonymous trial convertible (FR-01); working hours + sleep
window; rMEQ 5-item survey, every answer skippable, <3 min (FR-02); cold-start priors exactly per
File 04 §3: score→class mapping, Deep anchor matrix, logit-affine category transform, α₀/β₀ with
n₀ = 8/4, skip-halving, weekend rule; seed cluster = rMEQ class.
_Accept:_ dedicated math tests (rMEQ→class boundary values; transform σ(γ·logit(μ)+δ+δ_{g,p});
prior tables byte-exact vs. spec; halving rules); auth flows on device incl. anonymous→full
conversion. → FR-01, FR-02, UC-01, File 04 §3.
_(Google OAuth consent screen = human-action gate.)_

**P5 — RecSys service.**
FastAPI service: `/plan`, `/feedback`, `/insights`, `/parse-preview`, `/healthz` with Supabase JWKS
JWT verification; feasible-start precompute F_τ; bucketing φ; Beta cells with decayed counts;
LinUCB/TS linear-Gaussian state (NumPy) persisted to Postgres; CP-SAT model with
NewOptionalIntervalVar + AddNoOverlap, pinned tasks, splittable chunk chains, soft run-length and
fragmentation penalties, urgency multiplier, criticality term (no double counting), AddHint warm
start, 1.5 s anytime, degradation ladder (30-min granularity → day-by-day) with telemetry flags;
budgeted ε-exploration with exact propensity ε/m; MABWiser as CI test oracle.
_Accept:_ CP-SAT tests (no overlap incl. buffers, deadlines, pinned, splittable, criticality-only
deferral penalty); TS sampling shape test; propensity value correctness; solve ≤1.5 s on
representative day/week instances; ruff+mypy+pytest green; **workable-window computation treats
calendar busy time as optional input** (empty busy set = valid; MVP runs on self-declared hours,
UC-01 A2). → File 04 §1, FR-20 (service half), NFR-P1 (service budget), M-01 usage.
_(HF Space creation = human-action gate.)_

**P6 — Plan E2E.**
`plan-request` edge function (context assembly, calls `/plan`, persists recommendations +
propensities + model version + feature snapshot); **heuristic fallback in the edge function**
(deadline-first, priority tiers, declared hours — also the future study arm A), tagged
`engine=heuristic`; Today screen: timeline, glass recommendation blocks, one-sentence rationales
(FR-21), confidence-as-solidity + "experiment" label (FR-22); optimistic UI; empty-inbox path.
_Accept:_ end-to-end plan ≤2.5 s p95 warm (NFR-P1, measured); cold-backend fallback verified by
killing the Space; `recommendation_shown` logged with model version (NFR-O1); UC-03 main + A1 + A2
walked on device. → FR-20, FR-21, FR-22, UC-03, NFR-R2, NFR-P1, NFR-P3.

**P7 — Feedback loop.**
Focus sessions start/pause/finish/abandon with duration telemetry (FR-30); 1-tap post-session
rating, never modal-blocking (FR-31); implicit signal capture (FR-32); lazy lapse scan on
foreground; `attribute-rewards` at 23:55 local (pg_cron strategy per ADR); Sherman–Morrison
updates; decayed Beta counts; correction → full rebuild (UC-04 A1); third-consecutive-skip
diagnostic (UC-04 A2); drag-override paired feedback (FR-25, UC-07).
_Accept:_ SM-update ≡ naive recompute test; decay half-life test; rebuild-after-correction test;
lapse scan tests across DST boundary; two-phase semantics verified; FR-23 re-planning on next
plan event. → FR-23, FR-25, FR-30, FR-31, FR-32, UC-04, UC-06, UC-07, File 05 §1.

**P8 — Sync.**
Push-then-pull `sync-resolve`: op_id idempotency, base_version checks, three conflict classes,
facts-beat-plans, ambiguous-reward exclusion; Google Calendar OAuth + busy import + webhook +
incremental sync + displacement (`displaced_pending`, no reward), opt-in write-back (FR-03);
≤5 min consistency (UC-09); field-level merge on 409.
_Accept:_ duplicate op_id replay is a no-op (test); the File 05 §2 scenario reproduced end-to-end
incl. the counterfactual branch; offline→reconnect adversarial pass. → FR-03, NFR-R1 (full),
UC-09, File 05 §2, M-02.
_(Google Cloud project + Calendar API credentials = human-action gate.)_

**P9 — Trust surfaces.**
Energy heatmap hour×weekday with OKLCH interpolation + screen-reader alternative (FR-40); weekly
review with adherence trend + 2–3 learnings + correction toggles as high-weight labels (FR-33,
UC-08); "What Hourwell believes about you" (FR-41); conflict trade-off sheet with ranked
consequences, decision logged (FR-24, UC-05).
_Accept:_ heatmap renders from `/insights`; corrections round-trip to model state; infeasible day
produces the sheet, choice logged. → FR-24, FR-33, FR-40, FR-41, UC-05, UC-08.

**P10 — Notifications, privacy, a11y, performance.**
Block-start reminders with smart lead time, per-category mute, hard ≤5/day cap (FR-50); "plan
tomorrow" evening ritual (FR-26); JSON export + full deletion in-app with ≤30-day cascade (FR-42,
UC-10); WCAG 2.2 AA pass (NFR-A1) + 200%/reduced-motion sweep (NFR-A2); performance pass against
NFR-P1/P2/P3 with numbers. The perf/a11y half is scoped as **"prepare for device verification"**,
not "done": simulator numbers are smoke checks, protocols and instrumentation must be ready for
the hardware pass, and every device-conditioned item must be on `device-checklist.md`.
_Accept:_ cap enforced under notification storm (test); export contains tasks/events/learned
params; deletion cascades verified; a11y audit checklist; before/after perf table (labeled
simulator vs. device); device-checklist complete and runnable as a script for the hardware pass.

**Hardware verification pass (before P12, owner-run).**
The owner runs `docs/verification/device-checklist.md` on one physical iPhone and one physical
Android. This pass — not any simulator run — is where device-conditioned requirements (NFR-P2,
NFR-A1/A2 on device, gesture/haptic behaviour, real-radio sync, notification delivery) flip
to ✅. Findings feed fixes before release prep starts.

**P11 — Training pipeline + OPE + study mode.**
`train.yml` nightly: pseudonymized categorical export (CI-tested query — NFR-S3), ALS fit,
k-means clusters (silhouette), fold-in ≥30 outcomes, empirical-Bayes prior refresh
(`kind='priors'` registry rows), eval gate, HF Hub push; OPE harness: replay (randomized slice
only), IPS/clipped/SNIPS/DR, ESS gate <100 = non-evidence, MC propensities for TS traffic (K=32);
event archive to Parquet (File 06 §5); study-mode condition flags (A/B arms, template rationales
in A) so File 06 is runnable.
_Accept:_ estimator unit tests vs. hand-computed cases; ESS gate test; slice-restriction test
(replay refuses non-randomized rows); one-command replay harness reproduces tables. → File 04 §2,
File 06 §5, NFR-S3, NFR-O1 (replay).

**P12 — Release prep.**
EAS build profiles, store metadata as **Hourwell** ("The planner that learns your best hours"),
README, runbook (Space cold starts, cron failures, registry rollback), DPIA in `docs/privacy/`,
formal trademark/store-name search, CHANGELOG rollup. **Re-raise the store-economics decision
here** (Play $25 one-time vs. Apple $99/yr — deferred from Q4 by decision).
_(Apple/Google developer accounts = human-action gates.)_

**Deferred (priority S/C, not in P0–P12 unless you say otherwise):** FR-12 recurring tasks
(schema supports recurrence from P1; solver/UI later), FR-13 import, FR-27 what-if, FR-51 bandit
notification timing, read-only web.

---

## 4. What the Specs Leave Undecided

**A. Referenced predecessor documents — RESOLVED (decision 2026-08-24):**
`03_technical_architecture.md` v1.0 and the "Phase 4 audit" do not exist as deliverables: v1.0
described the superseded Flutter stack, and the audit's outcomes were folded into Files 03–06.
`specs/01–06` are complete and closed. The genuinely missing content (base schema, engine stages,
reward shaping §3.4, feedback §3.5, cold-start rungs §3.6, API schemas, security specifics) is
reconstructed in **`specs/07_engine_internals_and_schema.md`** (written in P0, approved by you
before P1, then read-only source of truth like the rest).

**B. Unfixed parameters** (each gets a proposed default in `specs/07`'s parameter appendix and is
fixed by ADR at the phase where it bites; defaults from referenced literature or conservative
choices, never invented APIs):
solver weights λ_d, λ_s, λ_f, M_τ; urgency γ_u, η; buffer b; d_min; run-length L, H_g; TS σ²;
LinUCB α_ucb; exact ε encoding ("1 slot/day" — probability vs. quota); LinUCB/TS feature vector
composition; partial-credit reward value for <50% abandonment (File 06 implies ≥50% ≈ complete);
whether postpone-count/reschedule-distance are rewards or features (RQ2 suggests features first);
category taxonomy (fixed 4 of File 04 §3.3 vs. user-defined mapped onto them); "relative-position
class" definition in φ; notification smart-lead-time default; plan horizon default (day vs. week);
06:00 plan trigger + 23:55 local attribution under per-user timezones on UTC pg_cron; DST rules;
retention windows; anonymous-trial data lifetime; rMEQ exact item wording/scoring presentation;
working-hours template default; magic-link email provider beyond Supabase's rate-limited built-in;
model_registry columns; ALS λ and confidence weighting; River blend target.

**C. Process/scope decisions:** resolved — see §5.

---

## 5. Decisions (answered & approved 2026-08-24)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | v1.0 / Phase-4-audit documents don't exist; `specs/01–06` complete & closed. Missing content reconstructed as **`specs/07_engine_internals_and_schema.md`** in P0 — derived from Files 01–06, inferences marked `[INFERRED]` with reasoning, open numerics get proposed defaults + fixing phase. Single review gate: approval of 07 before P1. No per-gap questions. |
| 2   | Monorepo, **public** at end of P0 right after the secret audit. `.gitignore` + pre-commit audit is the secrets control, never repo privacy.                                                                                                                                                                                                                          |
| 3   | **pnpm + Node 22 LTS** (`.nvmrc`, `packageManager`). `expo-doctor` compat check in P0; fall back to npm workspaces _without asking_, recorded in `docs/decisions/`.                                                                                                                                                                                                  |
| 4   | **iOS-first** development; Android compiles in CI; Android device pass at P10. Store economics ($25 vs $99/yr) is a P12 decision — re-raise there only.                                                                                                                                                                                                              |
| 5   | MVP = **P0–P7 on self-declared hours** (UC-01 A2). GCal in P8. P5/P6 must not assume calendar busy time exists.                                                                                                                                                                                                                                                      |
| 6   | **English strings + i18n scaffolding** (expo-localization + typed catalog) from P2; no hardcoded user-facing strings in components from P2 on (CI-linted if cheap); Ukrainian = add-a-file later.                                                                                                                                                                    |
| 7   | Supabase project confirmed: **West EU (Ireland)**, fresh, free to migrate; linked CLI + `supabase db push` (one-time login = ACTION REQUIRED gate in P1). Also confirm & document **PostHog EU instance** in P1 (NFR-S2 names both).                                                                                                                                 |
| —   | Name **Hourwell approved**; formal trademark/store search stays in P12. Commit convention applies from the very first P0 commit.                                                                                                                                                                                                                                     |

| 8 | (2026-08-24, post-P0) **P0 gate passed; specs/07 approved** — read-only truth. ADR-0001 (Node 24) + ADR-0003 (jest 29) accepted. **MIT license** for code; a future dataset gets CC-BY-4.0 `DATA_LICENSE`. ADR-0004: Expo 57/RN 0.86 accepted, **TS pinned 5.9** (openapi-typescript peer). |
| 9 | (2026-08-24) **Autonomous working mode** — phases back-to-back, PRs self-merged when green; stop conditions + decision rule in CLAUDE.md "Working mode". Owner keeps thesis-claim decisions only (open: spec-conflicts H1, ε-symmetric arms, decided at OSF freeze). |
| 10 | (2026-08-24) Thesis integration: `docs/thesis/` = pojasnennia.uk.md (living Ukrainian explainer, same-commit rule) + spec-conflicts.md (errata layer over frozen specs) + thesis-corrections.md (draft edit worklist); draft.docx is a consistency target, git-ignored. |
| 11 | (2026-08-26) **Simulator ≠ device evidence** — simulator runs are smoke checks; device-conditioned requirements flip to ✅ only at the owner-run hardware pass before P12 (one iPhone + one Android; running list `docs/verification/device-checklist.md`, maintained every phase). Refines row 4: the P10 "Android device pass" becomes "prepare for device verification"; the actual device pass is the pre-P12 gate. Full rule: CLAUDE.md "Simulator evidence". |

---

_P7 complete. P8 (Sync) opens next — read docs/HANDOFF.md for the exact spec sections it needs. The RecSys host is an open owner decision (ADR-0009)._
