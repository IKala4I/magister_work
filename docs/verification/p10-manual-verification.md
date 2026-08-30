# P10 manual verification — Notifications, privacy, a11y, performance

> Requirement checklist, gate output, what the evidence establishes and what it does not, the
> adversarial pass. Verification depth (CLAUDE.md "Working mode" 7): **FR-42 erasure/export is
> thesis-critical** (the GDPR claim in the privacy README and the consent clause) — pgTAP on the
> linked project + a live smoke once the migration is pushed; **FR-50's cap** is routine but
> storm-tested; **a11y/perf are device-conditioned by rule** — protocols and instrumentation
> ready, numbers labelled by where they were taken.

## 1. Gates (2026-08-30, `phase/P10-notify`)

| Gate                                            | Result                                                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` · `pnpm lint` · `format:check` | clean (packages/shared + apps/mobile + docs/verification scripts)                                                                                                                                                   |
| `pnpm test` (jest, from `apps/mobile`)          | **461 passed, 56 suites** (P9: 382/47) — +79: planner/ledger/scheduler/respond, settings + Today P10 cases, profile settings + conflict merge, privacy, analytics opt-out, a11y audit (incl. the scanner self-test) |
| `uv run ruff check` · `mypy` · `pytest`         | clean · clean · **149 passed, 8 skipped** (service untouched this phase)                                                                                                                                            |
| Deno fmt/lint/check/test                        | clean · **187 passed** (P9: 166) — +21: delete-account (12), export-data (6), plan-request trigger vocabulary (1), shared backend-key check (2)                                                                     |
| pgTAP `p10_privacy_test.sql`                    | **36/36** via `scripts/pgtap-linked.sh` against the linked project (migration applied inside the rolled-back transaction)                                                                                           |
| `npx expo-doctor`                               | 21/21 checks passed                                                                                                                                                                                                 |
| Contract sync                                   | `database.ts` hand-written for `deletion_audit.reason` + the two RPCs (CI's db job diffs it against the local database); `api.ts` unchanged (no service change)                                                     |

## 2. What is established

### 2.1 Tests (requirement → evidence)

| Requirement                                                                                 | Evidence                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-50 hard cap ≤ 5/day **under a storm** (PLAN §3 acceptance)                               | `plan.test.ts` (20 placements → 5; delivered budget; muted/closed/past; per-day budgets; determinism), `ledger.test.ts` STORM (3 re-plans + settings change + restart + next morning), `scheduler.test.ts` on real SQLite + a faked OS (ids, copy, cancel-and-replan, denied, clear)             |
| FR-50 lead time 10 min (Appendix A), per-category mute                                      | `plan.test.ts` (fire = slot − 10 min; `admin` muted → dropped), `notificationSettings.test.ts` (total parse; lead spec-owned), `profileDao.test.ts` (settings ride the `profile_update` snapshot), pgTAP 31–36 (`sync_apply_profile` merges settings)                                            |
| FR-26 evening ritual: one per day, Accept plans tomorrow, Adjust → Inbox, Sunday → Insights | `plan.test.ts` (ritual reserves a slot, Sunday variant), `respond.test.ts` (accept → `planTomorrow(tomorrow)`, routes), `today.test.tsx` (tomorrow line/card, one tap → `runPlanRequest('evening_ritual', …, tomorrow)`), Deno `plan-request` (trigger accepted, plan_date = tomorrow persisted) |
| UC-03 trigger with an evening plan (never re-plan today)                                    | `planTrigger.test.ts` (has-plan-for-today semantics)                                                                                                                                                                                                                                             |
| FR-32 notification response as a fact; invariant 1 (facts only)                             | `respond.test.ts` (one `notification_response` per response with latency; dedup; garbage ignored); `scheduler.ts`/`respond.ts` carry no reward/feature code                                                                                                                                      |
| Invariant 7: no correctness depends on a notification                                       | design — the scheduler only mirrors the plan the user last saw; lapse detection unchanged (P7 tests)                                                                                                                                                                                             |
| FR-42 export: whitelist = the 18 user-owned tables, titles stripped, paging, ceiling        | `export-data/handler_test.ts` (contract test pins exported ∪ server-only = pgTAP's table list; title omitted; 401; paging; truncation)                                                                                                                                                           |
| FR-42 erasure: cascade through EVERY user-owned table; audit survives; structural proof     | pgTAP 5–28 (every FK to auth.users cascades; the 18 tables pinned; a row in each → all gone; bystander intact; audit row remains)                                                                                                                                                                |
| FR-42 erasure paths: self / operator / retention, audited order, Google teardown, failures  | `delete-account/handler_test.ts` (11): audit → delete → complete; teardown first when connected; teardown failure never blocks; delete failure leaves the audit open; operator 401/400/404; retention batch with one failure                                                                     |
| Retention (Appendix A): anonymous + 30 d inactive only; daily tick scheduled                | pgTAP 29–30 (candidates; window), 4 (cron job), `params_test.ts` (30 d pinned across the boundary)                                                                                                                                                                                               |
| Client erasure: nothing forgotten on failure; everything forgotten on success               | `deleteAccount.test.ts`, `settings.test.tsx` (two confirmations → action → `/account-deleted` with the reference; failure line)                                                                                                                                                                  |
| Client export: file + share sheet; calm failures                                            | `exportData.test.ts`, `settings.test.tsx`                                                                                                                                                                                                                                                        |
| ADR-0014 §12 opt-outs                                                                       | `analytics.test.ts` (flag beats keys; toggle event last; client dropped), `state.test.ts`, `settings.test.tsx`                                                                                                                                                                                   |
| NFR-A1 mechanical rules; three AA misses fixed                                              | `a11yAudit.test.ts` (roles, labels, ThemedText cap, contrast matrix, accents never text) — see `p10-a11y-audit.md`                                                                                                                                                                               |
| Trigger vocabulary at the edge                                                              | Deno `plan-request/handler_test.ts` (unknown → 400; `evening_ritual` → 200, persisted)                                                                                                                                                                                                           |

### 2.2 Live on the hosted project (2026-08-30)

- Functions **deployed**: `export-data`, `delete-account`, `plan-request` (trigger vocabulary),
  `gcal-connect` (shared disconnect); **redeployed after the adversarial fixes** (2026-08-30,
  later the same day): `delete-account` (tolerant audit stamp, shared constant-time key check),
  `attribute-rewards`, `gcal-webhook` (shared key check).
- **Pre-migration run of `p10-live-smoke.mjs` (2026-08-30 16:20 UTC)** — what the deployed
  functions establish before the ⛔ push: `export-data` live **13/13** (401 without a session;
  200 in 1 407 ms cold from `eu-west-1`; format/version; the download filename; the profile with
  its notification settings; the task with its title; the `notification_response` fact that had
  just replayed through `sync-resolve`; 48 Beta cells with priors; the cluster row; no calendar
  `title` key; counts over 14 tables; no server-only ledger). `delete-account` auth live 3/3
  (401 without a session, operator and retention without the backend key). **Expected FAILs
  (6):** the migration checks (`deletion_audit.reason`, the cron job) and the self-erasure
  (500 — the audit insert needs the `reason` column), so the user's rows remained — that
  anonymous test user is exactly what the retention tick will purge after 30 days once the
  migration is in. One test user is left behind per run (30-day purge).

#### 2.2.1 Migrated project (2026-08-30, after `supabase db push` by the owner) — **25/25**

The first post-migration run surfaced one real defect and one tooling defect, both fixed the
same day before the clean pass below:

- **Real (FR-42): the session outlived the deleted account.** The access token is stateless —
  `auth.getClaims` only checks the signature, so `export-data` answered 200 (with an empty
  document) for up to the token's lifetime after erasure. Fix: the two **account** functions
  (`export-data`, `delete-account`) verify the session against the auth server
  (`auth.getUser` → `user_not_found` once the account is gone), and the delete handler
  additionally checks `userExists` before writing an audit row (never a second erasure;
  Deno test). Every other function keeps the cheap local check: a deleted user's ops fail on
  the FK / RLS side and reads return empty — bounded to the token's ≤ 1 h lifetime, no data
  exposure (the rows are gone), noted in ADR-0014 §8.
- **Tooling: the `sql()` helper mis-parsed the CLI's new output shape** (supabase CLI ≥ 2.115
  prints a pretty top-level ARRAY; slicing from the first `{` chopped the `[` — the same class
  of bug that bit the P9 smoke). Fixed **properly this time** (owner directive): one shared
  shape-tolerant parser, `docs/verification/lib/db-query.mjs` (first complete JSON value by
  quote-aware bracket matching; normalises array / `{rows}` / `{result}` / `{message}`;
  throws with the raw output, never a silent `[]`), used by BOTH `p9-live-smoke.mjs` and
  `p10-live-smoke.mjs`, with a self-test in the session log and a HANDOFF gotcha.

`node ../../docs/verification/p10-live-smoke.mjs` (from `apps/mobile`), functions redeployed
with the session fix first:

```
PASS  P10 migration applied (deletion_audit.reason exists)
PASS  retention-sweep cron job scheduled
PASS  anonymous sign-in on the hosted project
PASS  profile insert through RLS (priors instantiated by trigger)
PASS  a task and a notification_response fact replay through sync-resolve
PASS  export-data without a session → 401
PASS  export-data → 200 (1290 ms, region eu-west-1)
PASS  document format/version
PASS  download filename header
PASS  the profile with its notification settings
PASS  the task with its title (the user's own text)
PASS  the notification_response fact
PASS  48 Beta cells with their priors (learned parameters)
PASS  cluster assignment present; blend_state key present (null on day 0 — the service writes it at the first feedback)
PASS  no calendar title key anywhere in the export
PASS  counts cover every exported table
PASS  no server-only ledger in the document
PASS  delete-account without a session → 401
PASS  operator mode without the backend key → 401
PASS  retention mode with a wrong key → 401
PASS  service-side: the user's rows exist before erasure
PASS  delete-account self → 200 deleted (437 ms)
PASS  the session is dead afterwards (export → 401)
PASS  service-side: nothing of the user remains (profile, tasks, events, cells, bandit, sync_ops, auth.users)
PASS  the proof-of-erasure row: reason user_request, completed after requested
ALL PASS
```

The FR-42 acceptance is now fully live: export document (14 tables, no calendar titles, the
learned parameters) → self-erasure → dead session → zero rows for the uid in every user-owned
table incl. `auth.users` → the audit row `reason = user_request`, completed after requested.

### 2.3 Performance (NFR-P1 / P3) — numbers labelled by where they were taken

`docs/verification/p10-perf.mjs 20`, Node on an M-series Mac in Ukraine → hosted project (eu-west-1), 2026-08-30 16:03 UTC:

| endpoint                                | n   | p50 ms | p95 ms | budget ms | within       |
| --------------------------------------- | --- | ------ | ------ | --------- | ------------ |
| floor: `GET /auth/v1/health`            | 20  | 69     | 73     | —         | (wire floor) |
| REST read `GET tasks?select=id&limit=1` | 20  | 74     | 88     | 300       | ✅           |
| REST write `PATCH profiles.locale`      | 20  | 78     | 82     | 300       | ✅           |
| `sync-resolve` empty push + pull        | 20  | 346    | 477    | 300       | ❌           |
| `insights`                              | 20  | 679    | 714    | 300       | ❌           |
| `export-data` (small user)              | 10  | 505    | 736    | 300       | ❌           |
| `plan-request` learned, 5 tasks, warm   | 5   | 916    | 965    | 2 500     | ✅           |

Reading: **NFR-P3 holds for the core read/write API** (PostgREST under RLS: 82–88 ms p95, ~10 ms
above the wire floor). The **edge-function round trips do not** meet 300 ms: `sync-resolve` is a
composite (function boot + lease + replay RPC + pull RPC + release ≈ 4 database hops), `insights`
adds the VM hop (service ≈ 300 ms) and the PAR read, `export-data` reads 14 tables. None of them
is a user-perceived read/write — the client reads and writes SQLite locally (offline-first) and
syncs in the background of the interaction — but the spec's sentence is about the API, so the
composite numbers are reported as a miss and tracked (revisit.md: collapse lease + replay + pull
into one RPC; keep-alive; measure again from a handset). **NFR-P1** (≤ 2.5 s p95 warm) holds from
Node with the same margin P7.1 measured. **Before/after:** P6/P7.1 measured `plan-request` 1.5 s
p95 (Node) and the service 487 ms p90 on the VM; P10 sees 965 ms p95 on a 5-task inbox — same
class, no regression. Nothing here is a device number (device column: pending — `device-pass.sh`).

**NFR-P2 (cold start ≤ 2 s p90; 60 fps timeline):** not re-measured in P10 — the P2 simulator
number (1 075 ms p90, M-series Mac, iPhone 17 Pro simulator, Release) stands as the only value and
is explicitly simulator evidence; the P10 bundle grew (notifications, sharing) and the device pass
re-measures with `measure-cold-start.py` / Xcode App Launch and `adb am start -W` (script).

## 3. What is NOT established (and where it is tracked)

- ~~The live export/erasure round trip~~ — **done 2026-08-30 (§2.2.1, 25/25)** after the owner's
  migration push; incl. the dead-session check.
- **Real notification delivery** (APNs/FCM local delivery timing, Doze, OEM battery savers,
  category action buttons, cold-start response) — `device-checklist.md` "Sync & notifications"
  FR-50 + the P10 entries.
- **VoiceOver/TalkBack, 200 % on hardware, Android font + display scale** — `p10-a11y-audit.md`
  §2/§3; `e2e/p10-a11y-sweep.yaml` not executed in P10.
- **NFR-P2 on the P10 bundle** — device pass.
- **E-mail confirmation of erasure** — replaced by the in-app reference (ADR-0014 §9);
  thesis-corrections #43; owner decision if a mail processor is wanted.
- **Two-device ritual** — the accept on one device plans tomorrow for the account; the other
  device sees it at its next sync (fine); its own ritual notification still fires (a second
  "Plan tomorrow?" that finds the plan already made) — revisit.md.

## 4. Adversarial pass (fresh-context subagent, 2026-08-30 → fixes the same day)

**2 MAJOR + 12 MINOR.** Both MAJORs and ten MINORs fixed; two MINORs documented.

| #   | Finding                                                                                                                                                                           | Fix / disposition                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `settings` dropped on the profile **conflict** path (`merge.ts`/`engine.ts` rebuilt the op from a fixed field list): a second device's newer mute/ritual change reverted silently | `settings` ride with the LWW winner (fallback to the other side when the winner's payload has none); the engine writes them locally; `merge.test.ts` covers 4 combinations            |
| M2  | Analytics opt-out only dropped the reference; PostHog's own lifecycle capture kept running ("Stops immediately" was false); lifecycle events were never in the typed catalog      | `optOut()` on the live instance after the toggle event, then drop; instance created with `captureAppLifecycleEvents: false`; test asserts both                                        |
| 1   | Sign-out / account switch left the previous account's reminders (with task titles) scheduled; a tap would write a fact under the new uid                                          | `clearAllNotifications()` (moved to `setup.ts`, no DB import) in `signOut()` and `transitionToAccount()`                                                                              |
| 2   | Ritual "accept" after midnight planned the day after tomorrow (`tomorrowOf(now)`)                                                                                                 | `nextPlanDayOf(scheduled_for)` — the day after the ritual's own plan day; `respond.test.ts` 00:30 case; `planTrigger.test.ts`                                                         |
| 3   | Today flipped to the evening plan at 00:00, against the 06:00 plan-day anchor                                                                                                     | before 06:00 the previous plan day's plan stays (`previousRows[0] ?? todayRows[0]`); the "tomorrow" line/card and `ritualDue` follow the plan day                                     |
| 4   | Settle-before-cancel window: a request firing between the two calls was delivered but uncounted                                                                                   | cancel first, then settle                                                                                                                                                             |
| 5   | A pass with no profile row scheduled the ritual from defaults (race after erasure)                                                                                                | no profile → `commitScheduled([])`, return; `scheduler.test.ts`                                                                                                                       |
| 6   | `completeAudit` failure after `deleteUser` → 500 → the device kept a dead session and every retry was 401                                                                         | logged, `deleted` still returned (the open audit row is the evidence); `handler_test.ts`                                                                                              |
| 7   | Backend-key compare was `===` and accepted an empty configured key                                                                                                                | `_shared/auth.ts` (`constantTimeEqual`, `serviceKeyMatches` rejecting empty) used by delete-account; attribute-rewards and gcal-webhook switched to the shared helper; `auth_test.ts` |
| 8   | Cap is per install (two devices remind twice); ADR said the ledger keys on the plan day — it keys on the calendar day of the fire time                                            | **documented** (ADR §2, CHANGELOG, explainer, revisit two-device line)                                                                                                                |
| 9   | Permission read once on mount (back from OS settings showed stale state)                                                                                                          | re-read on `AppState` `active` in Settings and Today                                                                                                                                  |
| 10  | Radio chips announced `selected`, not `checked`; non-preset stored time shows no chip                                                                                             | `checked` on the ritual and the appearance radios (tests updated); non-preset case **documented** in the audit table                                                                  |
| 11  | Audit regex stopped at the `>` of an arrow function (false positive risk)                                                                                                         | brace/quote-aware opening-tag scanner + a self-test                                                                                                                                   |
| 12  | Doc nits: `truncated` is a list; `optOut()` claim; retention = "no synced event"                                                                                                  | ADR §7/§10/§12 reworded                                                                                                                                                               |

Checked and found sound by the reviewer: invariants 1/7 on every notification path; the cap
arithmetic across re-plans, day rollover, pruning, clock changes, restarts, DST; the response
dedup and cold-start ordering; the server event type/ownership checks; RLS-as-filter for all 14
exported tables and the paging keys; erasure order, cascade, retention loop isolation, grants on
the new objects; the MMKV/SecureStore leftovers after erasure (device id, op counter, scheme
preference, opt-out flags only).
