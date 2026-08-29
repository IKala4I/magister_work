# P9 manual verification — Trust surfaces

> Requirement checklist, gate output, what the evidence establishes and what it does not, the
> adversarial pass. Verification depth (CLAUDE.md "Working mode" 7): **corrections (FR-33/41 →
> model state) are thesis-critical** — measured in the service tests and, once the migration is
> on the hosted project, live; the heatmap/belief rendering and the FR-24 sheet are routine
> (Definition of Done, device items on the checklist).

## 1. Gates (2026-08-29, `phase/P9-trust`)

| Gate                                            | Result                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck` · `pnpm lint` · `format:check` | clean (packages/shared + apps/mobile)                                                                                                                                                                                                                  |
| `pnpm test` (jest, from `apps/mobile`)          | **380 passed, 47 suites** (P8: 344/42) — +36: heatmap, oklch, tradeoff, insightsDao, Insights screen, Today sheet                                                                                                                                      |
| `uv run ruff check` · `mypy` · `pytest`         | clean · clean · **149 passed, 8 skipped** (P8: 137) — +12: labels weight/decay/personal (+ out-of-hours weight), store+rebuild, latest wins (+ same-timestamp tie), interleave, bandit untouched, /labels auth, beliefs/rung-2, planner deferral guard |
| Deno fmt/lint/check/test                        | clean · **165 passed** (P8: 155) — +10: PAR rule/weeks/exclusions/H2 guard, insights EF, label delivery                                                                                                                                                |
| pgTAP `p9_trust_test.sql`                       | **21/21** via `scripts/pgtap-linked.sh` against the linked project (migration applied inside the rolled-back transaction)                                                                                                                              |
| `npx expo-doctor`                               | see §1.1                                                                                                                                                                                                                                               |
| Contract sync                                   | `api.ts` regenerated from the service OpenAPI (CI diffs it); `database.ts` hand-written for `belief_labels` (CI diffs it against the local DB — see §3)                                                                                                |

### 1.1 expo-doctor

`Running 21 checks on your project... 21/21 checks passed. No issues detected!` (2026-08-29)

## 2. What is established

### 2.1 Tests (requirement → evidence)

| Requirement                                                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-41 label → model state; invariant 6 (rebuild) + invariant 5 (prior untouched)  | `test_energy.py`: `apply_label` adds α₀+β₀ pseudo-observations to S or F, prior fields unchanged, decays with the 28 d half-life, out-of-order delivery equals in-order; `test_feedback.py`: `/labels` stores + rebuilds, re-delivery converges, latest label wins, `none` clears to S = F = 0 with no event, labels interleave with tuples by timestamp under decay, the bandit's (A, b) equals the tuple-only rebuild, a later `/feedback` correction keeps the label |
| specs/07 §3.6 rung 2: labelled cell personal; badge off                           | `test_energy.py` (`is_personal(labeled=True)`, `learning_mode` with the labelled set), `test_insights.py` (belief `personal`, `learning_mode` false with one labelled active cell)                                                                                                                                                                                                                                                                                      |
| `/labels` authorization (sub match / service key), vocabulary, 409 uninstantiated | `test_api.py::test_labels_endpoint_auth_and_validation`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `belief_label` event → ledger row; replay no-op; malformed → op fails; RLS        | `p9_trust_test.sql` (21): trigger row with parsed cell + client timestamp, duplicate op, `none` allowed, unknown daypart/label → `error` and no event, plain facts never materialise, A reads own rows, no client insert, B sees none                                                                                                                                                                                                                                   |
| Store-then-deliver for labels in the reward pass                                  | `attribute-rewards/handler_test.ts`: undelivered rows posted after the tuples and marked delivered; failed call leaves them for the next pass and re-sends; second pass `nothing_pending`                                                                                                                                                                                                                                                                               |
| FR-33 PAR per ISO week from facts only (H2)                                       | `_shared/par_test.ts`: File 06 §1.4 per-block rule (grace on start, ≥ 50 % across in-window sessions, `task_completed` alone is not adherence), ISO week of the LOCAL date (Sunday 23:30 Kyiv vs Monday 00:30), displaced/pending/expired/open excluded, source guard (no reward column, constants from `params.ts`)                                                                                                                                                    |
| `insights` EF: auth, profile gate, merged document, 503 on outage                 | `insights/handler_test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR-40 grid mapping + text alternative + solidity                                  | `heatmap.test.ts` (18 × 7, daypart repeat across hours, day type across weekdays, absent category → null, summary best/lowest, solidity 0.5 at n₀), `oklch.test.ts` (token round-trip within 1/255, monotone L along the ramp, grey adopts the hue)                                                                                                                                                                                                                     |
| FR-40/41/33 screen                                                                | `insights.test.tsx`: empty → document, badge + provenance, grid summary label, text view, category switch, toggle → action (device fact beats server label, pending caption), clear, picker → `tellBestTimeAction`, done → review fact with this ISO week, thanks line when done                                                                                                                                                                                        |
| FR-24 option parsing + copy                                                       | `tradeoff.test.ts` (server order kept, unknown kinds dropped, consequence sentences per metric)                                                                                                                                                                                                                                                                                                                                                                         |
| FR-24 apply/reject on real SQLite                                                 | `insightsDao.test.ts`: drop (earliest_start = tomorrow local midnight, +1 postpone, inbox, task op with base_version), shrink (floor 15), move (deadline + slip), unpin (`recommendation_status` op), rejection fact, decided plan ids                                                                                                                                                                                                                                  |
| FR-24 sheet on Today                                                              | `today.test.tsx`: ranked options with consequences, choose → `applyTradeoffAction` with rank, reject → fact, answered plan hides the sheet, feasible plan shows none                                                                                                                                                                                                                                                                                                    |

### 2.2 Live on the hosted project (2026-08-29, `p9-live-smoke.mjs`, 10/10 + 2 SKIP)

Functions `insights`, `attribute-rewards`, `sync-resolve` deployed; the P9 service image built
from the branch (`deploy-recsys.yml` workflow_dispatch → GHCR → the VM's 5-min rollout timer,
confirmed by the workflow). The migration is NOT applied (⛔), so the service's `/insights` (and
any rebuild) cannot read `belief_labels`: the function relays **503 `service_unavailable`** — the
designed outage contract (the client keeps its cached document) — and the smoke SKIPs the
document + label checks with the reason. **FR-24 is verified live:** two pinned blocks on one slot
→ `plan-request` answers `infeasible.options` with `unpin` ranked first, stored in
`plans.telemetry.infeasible` (what the sheet reads), and the `tradeoff_decision` fact syncs.

```
PASS  anonymous sign-in on the hosted project
PASS  insights without a session → 401
PASS  insights before onboarding → 404 profile_missing
PASS  profile insert through RLS (priors instantiated by trigger)
      insights round trip: 872 ms (service — ms)
PASS  EU region header on insights
PASS  insights → 503 service_unavailable while the service cannot read belief_labels (designed: the client keeps its cache)
SKIP  insights document (48 cells, 8 beliefs, learning mode, provenance, DM prior on deep/MO) — P9 migration not on the hosted project yet (⛔ supabase db push --linked)
SKIP  belief_label fact → trigger row → /labels delivery → rebuild → insights — P9 migration not on the hosted project yet (⛔ supabase db push --linked)
PASS  two tasks synced
PASS  plan-request planned both tasks
      plan-request round trip: 1196 ms (engine learned, learned)
PASS  re-plan with two pins on one slot → infeasible options (FR-24), unpin first
PASS  options are stored in plans.telemetry.infeasible (what the sheet reads)
PASS  tradeoff_decision fact synced (UC-05 post: decision logged)

ALL PASS (2 skipped)
```

**Re-run after the adversarial fixes** (`7c7c238`: functions `plan-request`/`insights`
redeployed, service image rebuilt from the branch and rolled out): identical result — 10/10 +
2 SKIP, plan round trip 1742 ms (learned).

**What the first run found (fixed in `3d04a0c`):** with the migration missing, every
`sync-resolve` reward pass threw on the ledger read _after_ the replay had committed → 500 to
the client, tuples undelivered. The label stage now logs the read failure, reports
`labels_delivery: failed` and retries next pass — the least critical stage never takes the sync
down (Deno test). Order for the owner: **push the migration, then** nothing else — the
functions and the image are already the P9 versions.

## 3. What is NOT established (and where it is tracked)

- **The live label round trip** (fact → trigger → `/labels` → rebuild → `/insights`): the P9
  migration is verified against the linked project only inside a rolled-back transaction;
  `supabase db push --linked` was refused by the session's permission classifier. ⛔ owner
  (HANDOFF); the smoke then runs the full block.
- **`database.ts` for `belief_labels`** was hand-written (no local Docker); the CI db job
  regenerates and diffs it — a mismatch fails CI, not a user.
- **200 % font scale, VoiceOver/TalkBack on the grid and toggles, the sheet on a real
  over-committed day, reduced motion** — `device-checklist.md` "Trust surfaces (added P9)".
- **Rung-2 badge on labels alone** for a user with few outcomes — a P11 first-data-review line
  (revisit.md).
- **Two-device decisions** (the sheet re-appears on a second device until its own decision or
  the re-plan) — revisit.md.

## 4. Adversarial pass (fresh-context subagent, 2026-08-29 → fixes `7c7c238`)

Attack angles given: invariants 5/6 under labels (ordering, decay, `none`, duplicates,
transactionality, replay), H2/invariant 3 in PAR, RLS/trigger forgery, offline merge + cache,
FR-24 semantics (drop/shrink/unpin against `plan-request/context.ts`), a11y contracts, contract
drift (`api.ts`, hand-written `database.ts`), docs-vs-code, test quality. Result: **4 MAJOR +
10 MINOR**; all MAJORs and 8 MINORs fixed and re-tested; 2 MINORs + 1 note recorded in
`revisit.md`.

| #   | Sev   | Finding                                                                                                                                                                  | Fix                                                                                                                                                       |
| --- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | MAJOR | Nothing ever set `events.server_ts`, so every label showed "Saved — applies at the next sync" forever                                                                    | `applyAcks` sets `server_ts`/`server_seq` on applied/duplicate `event_append` acks; engine test                                                           |
| 2   | MAJOR | `clearInsightsCache` had no caller: user B on the same phone saw user A's beliefs from MMKV                                                                              | cache carries `userId` and is ignored on mismatch; `wipeLocalMirror` clears it                                                                            |
| 3   | MAJOR | `drop` (earliest_start = tomorrow) left the task critical + unplaceable → `drop` option again → the sheet reopened every re-plan, burning postpones and the /plan budget | `plan-request/context.ts` no longer sends tasks deferred past the horizon; the planner marks such a task non-critical (pytest: no options, task unplaced) |
| 4   | MAJOR | `BeliefCard` wrapper `accessible` swallowed the ✓/✗ Pressables on iOS VoiceOver — FR-41 unreachable by screen reader                                                     | label moved onto the statement text; toggles are focusable siblings                                                                                       |
| 5   | MINOR | `unpin` searched `pinned` rows in the infeasible plan (all `shown`); the pin sits on the previous plan → no status op                                                    | query the task's live `pinned` row by status; DAO test seeds the pin on the previous plan                                                                 |
| 6   | MINOR | a permanently refused label batch (409) blocks later labels — same contract as `/feedback`                                                                               | revisit.md (P12 runbook: skip 4xx with a reason)                                                                                                          |
| 7   | MINOR | `labeled_at = client_ts` unclamped: a fast device clock freezes the cell's decay                                                                                         | trigger uses `least(client_ts, now())`; pgTAP future-clock case                                                                                           |
| 8   | MINOR | `insights` EF `.limit()` without `.order()` → arbitrary subset once exceeded, PAR silently wrong                                                                         | ordered newest-first + a warning at the cap                                                                                                               |
| 9   | MINOR | migration header said a bad vocabulary comes back `rejected`; it is `error` (5 retries then dead-letter)                                                                 | comment fixed; revisit.md (map 22023 → `rejected` with the next sync migration)                                                                           |
| 10  | MINOR | fixed `width` on mono captions clips at 200 %                                                                                                                            | `minWidth` + `flexShrink: 0`                                                                                                                              |
| 11  | MINOR | `latest_labels` tie-broke on lexicographic id; op ids are numeric-monotonic                                                                                              | stable sort on time; Postgres orders by `created_at` (= delivery order); test with `dev-9`/`dev-10`                                                       |
| 12  | MINOR | `applyTradeoffAction` threw on a task deleted elsewhere                                                                                                                  | falls back to `rejectTradeoffs`; DAO test asserts the throw happens before any write                                                                      |
| 13  | MINOR | before 06:00 the sheet could answer yesterday's plan                                                                                                                     | gated on `plan.planDate === todayDay`                                                                                                                     |
| 14  | MINOR | dead i18n keys; `value_forfeited` copy misread value·q̂                                                                                                                   | keys removed; "gives up about {value} points of expected value today"; trend copy names "the previous week with data"                                     |

Verified OK by the reviewer (no change): labels enter the rebuild timeline at their own
timestamp (tuples first on ties), decay like evidence, `none` clears via rebuild, bandit/blend
untouched, weight = the cell's own prior; `save_labels` outside the rebuild transaction is safe
(the trigger stored the row; delivery marks only on 200; a retry rebuilds); `par.ts` and the EF
touch no reward column, PAR = File 06 §1.4, ISO weeks in the profile zone; clients cannot insert
`events` or `belief_labels`, the trigger uses `new.user_id`, `/labels` is guarded like
`/feedback`; `api.ts` regenerates clean and the hand-written `database.ts` matches the migration
(confirmed by CI's db job); `syncBeforePlan` pushes the task op before `/plan`; heatmap grid is
one accessible image; toggles 44 px with `selected`; nothing red; reject secondary. Note kept
for the explainer/revisit: ✗ on the favoured cell moves the belief to the next daypart, so the
✗ leaves the list while staying in force on the cell.
