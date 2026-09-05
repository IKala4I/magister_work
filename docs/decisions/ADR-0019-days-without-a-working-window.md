# ADR-0019 — Days without a working window: no plan request, no persisted plan, no ritual, and a truthful Today

- **Date:** 2026-09-04
- **Status:** **accepted, implemented 2026-09-05** (post-pass fix batch, build 6: commits
  `a6cc959` function, `d585f61` client) — technical decision under the working-mode rule; the
  owner classed the finding as a product defect and asked for the rule. Hardware verification on
  build 6: see the device checklist (UC-03 non-working days) and the build-6 notes.
- **Phase:** hardware pass (post-P12), Android day 4, evening
- **Spec anchors:** File 02 FR-20 ("respecting … working hours"), FR-26 ("Plan tomorrow" evening
  ritual, one-tap accept/adjust), UC-03 (daily plan generation, 06:00 local or first open), UC-08
  (Sunday-evening review, FR-26 cadence); ADR-0014 §3 (ritual scheduling and response); ADR-0008
  (`plan-request` contract); `docs/verification/device-pass/android-20260904-0827/notes.md` items
  20 and 23; `docs/decisions/revisit.md` (2026-09-04 non-working-day line, superseded by this ADR).

## Context — what a real calendar surfaced on day 4

**What the user saw (Pixel 7a, Friday 2026-09-04, build 4).** The 20:00 ritual read "Plan
tomorrow? — 6 tasks are waiting — one tap plans your day." A tap on "Plan tomorrow" cold-started
the app and, two seconds later, nothing visible had changed: Today still showed Friday, no
"Tomorrow is planned" line. Had the user opened the app on Saturday morning they would have read
"No plan yet — Add a task in the Inbox and Hourwell plans it here." above "No room today for 15
tasks — they stay in your Inbox." — two messages that are both wrong (there are tasks; the reason
there is no room is that Saturday is not a working day).

**What actually happened (server rows).** One `notification_response` (`accept`), then one
`plans` row for 2026-09-05 — trigger `evening_ritual`, engine learned, solver OPTIMAL in 762 ms,
**0 recommendations**, all 15 inbox tasks in `unplaced` with `no_feasible_start`. The profile's
working hours are declared for mon–fri only; the 5th is a Saturday. The empty row counts toward
the 30-plans-per-24-hours budget and, because a plan row for the 5th now exists, the Saturday
first open will not issue a `new_day` request either (ADR-0014 §3's "a plan exists" rule).

**Why it happens — the hole is structural, not ritual-specific (checked in code, day-4 notes
item 23).**

- `supabase/functions/_shared/grid.ts` `buildGrid`: a tick is workable only when
  `workingHours[weekday]` exists and contains it; a weekday without hours yields a day with zero
  workable ticks. Both engines then place nothing — the learned path returns an OPTIMAL empty
  plan, the heuristic mirror the same — and `plan-request` persists the plan row as usual.
- `supabase/functions/plan-request/handler.ts`: the only short-circuit before planning is
  `ctx.tasks.length === 0 → { status: 'empty_inbox' }`. There is no "no working window" check.
- `apps/mobile/src/domain/planTrigger.ts` (`decidePlanTrigger`): the 06:00 / first-open trigger
  asks for today's plan whenever today has none — on a Saturday that is one empty persisted plan
  per non-working day (then deduped for the day). A manual **Re-plan** on such a day does the
  same on every tap, each one spending budget.
- `apps/mobile/src/notifications/plan.ts` (`planNotifications`): the daily ritual is scheduled
  for every day of the horizon; its inputs are the notification settings only — it cannot know
  whether the next plan day has a window.
- **Not a hole:** "all days off" cannot be declared — onboarding rejects it
  (`onboarding.hours.errorNoDays`) and Settings has no working-hours editor yet (P10 comment in
  `app/settings.tsx`). The Sunday-evening ritual variant opens the weekly review (UC-08), not a
  plan, and is unaffected.

**Why the simulator and the unit tests never showed it.** Every fixture plans a weekday; the
manual verification scripts run within one day; the P10 ritual tests assert the schedule and the
response routing, never the _content_ of the day being offered. Only a run across a real
Friday→Saturday boundary on a real calendar makes the ritual promise a plan the calendar cannot
hold.

## Decision — the rule

A **plan day without a working window** (no `working_hours` entry for its weekday, or an entry
whose ticks are all removed by the sleep window and the 00–06 rule) is handled the same way on
every path:

1. **Function:** `plan-request` answers `200 { status: 'no_working_window', plan_date }` before
   calling any engine — **nothing is persisted, no recommendation rows, no budget consumed**. The
   check runs after the profile and date validation and before the empty-inbox check (an empty
   inbox on a non-working day is still "no working window": the truthful reason comes first).
2. **Client, request path:** the outcome maps to `plan_status = 'no_working_window'`; for
   `first_open` / `new_day` it counts as an **answered** outcome, so the durable per-day dedup key
   is written and the day is not re-asked on every foreground. A manual **Re-plan** on such a day
   shows the same state without a network round trip when the client already knows the window is
   empty (the profile is local); otherwise the function answer is cheap and unpersisted.
3. **Today copy:** on such a day the empty state reads "No working hours today — Hourwell plans
   your working days." (uk: «Сьогодні не робочий день — Hourwell планує ваші робочі дні.») and the
   deferred line ("No room today for N tasks") is **not** shown; the Inbox count stays visible in
   the tab. Confidence semantics untouched; no guilt UI (invariant 14).
4. **Ritual:** the **daily** variant is not scheduled when the _next plan day_ has no working
   window (the scheduler receives the profile's `working_hours`; the next plan day = the day after
   the ritual's own plan day, exactly `nextPlanDayOf`). The Sunday variant (weekly review) keeps
   its schedule. When the ritual does fire, its body stays truthful by construction.
5. **Ritual accept on a stale notification** (a ritual that fired before the rule shipped, or
   whose next day lost its window since): the accept returns `no_working_window`, the fact is
   still logged (FR-32), nothing is persisted, and Today shows the state above.

Rejected alternatives: (a) persisting an explicit empty plan and rendering "no working hours" from
it — spends budget, and a 0-block row is a plan the user never asked for; (b) letting the ritual
fire with a "no working hours tomorrow" body — a notification whose only content is "nothing to
do" is noise under the ≤ 5/day cap and the no-guilt rule; (c) deriving the state client-side only
— the function must refuse as well, or a stale client keeps spending budget.

## Consequences

- Facts and rewards: unaffected (no recommendation rows are created, so nothing to attribute);
  invariants 1–3 untouched; the `plans` budget is no longer consumed by non-working days.
- Telemetry: `plan_requested.outcome` gains `no_working_window`; the OPE and PAR pipelines ignore
  requests without recommendations already.
- Contract: `PlanRequestResponse.status` gains the value (shared types + `api.ts` regeneration,
  `chore(repo):` commit); the P6 parity fixture is unaffected (weekday instances).
- Tests to add: handler (`no_working_window` before engines, nothing persisted, budget untouched),
  grid (a weekday with no hours ⇒ zero workable ticks — the existing behaviour, pinned),
  `planNotifications` (ritual skipped when the next plan day has no window; Sunday variant kept),
  `usePlanTrigger` (answered outcome writes the dedup key), Today copy (en/uk).
- Hardware: the rule cannot be verified on the device inside this pass (owner decision 2026-09-04
  evening: the pass ends after the owner-attended items and FR-42 erasure). Recorded as
  **unverified by choice** in the device checklist, alongside build 5's ritual re-check.
- Thesis: this is the cleanest example in the pass of a defect that neither the simulator nor the
  tests could surface — it needs a multi-day run across a real week boundary on a real calendar
  (thesis-corrections #52).

## Implementation notes (2026-09-05, build 6)

- **Function.** `hasWorkingWindow` in `_shared/grid.ts` is `buildGrid` without the clock and the
  calendar (`busy: []`, `nowMs: null`) — one predicate for both engines and the check. The handler
  answers `200 { status: 'no_working_window', plan_date }` after the 429 / profile / date checks
  and before the empty-inbox check. A working day whose window has already passed is still planned
  (an empty plan is a plan); the week horizon has a window when any of its days does.
- **Client.** `hasWorkingWindowOn(day, hours, sleep)` mirrors the predicate for one local day on
  midnight-aligned 15-min ticks (`src/domain/workingHours.ts`), reading malformed profile data the
  way `buildGrid` does (an end past midnight is cut at the last tick, a `{}` sleep window is none)
  so the two sides never disagree on "day off". `runPlanRequest` answers a day off from the local
  profile BEFORE the session/sync/network path for `first_open` / `new_day` / `evening_ritual` —
  no round trip, no planning banner, works offline — and the outcome is "answered" (the durable
  dedup key is written for `first_open` / `new_day`; the ritual's request never touches today's
  key). A **manual** re-plan skips the local check: it runs the pre-plan sync first and lets the
  function answer, so a working window added on the server is planned on that very tap (the
  answer is cheap and unpersisted; adversarial pass finding 2). Telemetry:
  `plan_requested.outcome = 'no_working_window'` with `duration_ms = 0` on the local path.
- **Today.** The day-off state is derived from the profile, not from a request outcome, so a cold
  start on a Saturday is truthful without any request; the deferred line of a legacy zero-block
  row is hidden on such a day. The app ships English only (`src/i18n/en.ts`); the Ukrainian copy in
  Decision §3 is recorded for the future `uk` catalog. "Plan my day" stays visible: a tap on a day
  off syncs and asks the server (banner, then the same day-off copy) — the tap that follows a
  server-side hours edit plans the day. The in-app "Plan tomorrow?" card (FR-26 on Today) obeys
  §4 like the notification: it is not offered when tomorrow has no window (adversarial pass,
  finding 1 — the same promise one screen over).
- **Ritual.** `planNotifications` takes the profile's hours and sleep window; the daily variant is
  skipped when `nextPlanDayOf(fireAt)` has no window, the Sunday variant is kept; a skipped ritual
  frees its cap slot for block reminders. A ritual that already fired for such a day (delivered
  before build 6, or hours removed since) is handled by §5: the fact is logged in `respond.ts`
  before the request, the request is answered locally, Today shows the day-off copy.
- **Contract.** `PlanRequestResponse` gains the member in `_shared/types.ts` and
  `apps/mobile/src/sync/types.ts`; `packages/shared/api.ts` is generated from the RecSys
  service's OpenAPI, not from the edge function, so no `chore(repo):` regeneration applies.
- **Tests.** Deno: handler (before the engines, nothing persisted, ritual trigger, empty inbox on a
  day off, night-only hours, a passed window still planned, 429 first) + grid predicate. Jest:
  predicate cases, trigger hook (local answer, dedup, manual, ritual, server answer, no profile),
  Today copy, planner (skip / keep / Sunday / no inputs), scheduler integration.
