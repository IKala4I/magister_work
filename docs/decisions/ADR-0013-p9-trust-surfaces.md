# ADR-0013 — P9 trust surfaces: belief labels as corrections, the insights read path, the trade-off sheet, the heatmap

- **Date:** 2026-08-29
- **Status:** accepted (autonomous phase, CLAUDE.md "Working mode"; owner-facing items are marked)
- **Phase:** P9
- **Spec anchors:** File 02 FR-24, FR-33, FR-40, FR-41, UC-05, UC-08, §3.1 (confidence =
  solidity), §3.2 (`energyHigh`/`energyLow`); File 03 §2 stack table ("Skia heatmap"); File 04
  §3.2 (dayparts), §3.3 (prior strength n₀); File 05 §1 (28-day evidence decay, rebuild on
  correction), §2 (facts beat plans); File 06 §1.4 (PAR); specs/07 §3.2.1 (Beta cells), §3.4.2
  (correction window, rebuild), §3.5 (two-phase feedback), §3.6 (three rungs), §5 `GET /insights`
  (`state_ref` "is what FR-41 correction toggles post back against"), §5 `/plan` (`infeasible`
  options "relayed to the client sheet; the user's pick returns as a new /plan call"); CLAUDE.md
  invariants 1, 3, 5, 6, 8, 14; spec-conflicts H2, H3; ADR-0007 §8–§10, ADR-0010 §11 (rung-2
  helpers, "personal phrasing is P9 UI"), ADR-0012 §1–§2 (op replay); revisit.md P9 lines.

## Context

The specs describe the trust surfaces in one sentence each and leave the mechanism open:
FR-41 says a belief carries "a correct/incorrect toggle (direct model feedback)" and specs/07 §5
says the toggle "posts back against" a `state_ref` that names a Beta cell — but not what a toggle
does to the cell; UC-08 says corrections are "applied as high-weight labels" without a weight;
FR-33 gives the example "actually, I _am_ a morning person". Invariant 6 says any correction
rebuilds from stored tuples and invariant 5 says priors never overwrite evidence, so a label must
be a stored fact the rebuild replays, not an edit of the posterior. FR-40 wants an hour × weekday
heatmap of a model that has six dayparts × two day types; File 03's stack table nominates Skia.
FR-24 wants a ranked trade-off sheet whose choice is logged; the planner already produces ranked
options (P5, `planner.py::_options`) and the edge function stores them in `plans.telemetry`.
File 06 §1.4 defines PAR and spec-conflicts H2 forbids deriving it from the reward table.

## Decisions

1. **A belief label is a fact that becomes a correction.** The client appends a `belief_label`
   event `{state_ref, label ∈ {correct, incorrect, none}, surface}` through the op outbox (class
   1, ADR-0012 §2) — the client never touches model state (invariant 1). A trigger on `events`
   materialises it into `belief_labels` (id = the event's op_id, so a replayed op is a no-op;
   malformed vocabulary fails the op, nothing half-applied). The sync-resolve reward pass POSTs
   undelivered rows to the service's new `POST /labels` after the tuples and marks them
   delivered — the same store-then-deliver contract as `feedback_rewards` (specs/07 §3.5.5), so a
   service outage delays a label, never loses it. The user's own rows are readable under RLS
   (toggle state across devices); no client grant writes them.
2. **Weight = one prior's worth; latest label per cell in force; every delivery rebuilds.**
   `correct` adds `w = LABEL_WEIGHT_FACTOR · (α₀ + β₀)` pseudo-successes to the named cell,
   `incorrect` adds `w` pseudo-failures, `none` adds nothing (the cleared toggle); `w` is the
   cell's own prior strength (File 04 §3.3: 8 h in-hours, 4 h out-of-hours) — "as much as
   everything the model assumed before meeting you", which is the most defensible reading of
   "high-weight" that introduces no new number **[INFERRED]**. A label decays like evidence
   (28 d half-life, File 05 §1): with no fresh signal a labelled cell relaxes toward its prior,
   exactly as invariant 5 requires; the prior itself is never touched. Only the latest label per
   cell (by `labeled_at`) counts; earlier rows stay for audit. **Every `/labels` call runs the
   full rebuild** from stored tuples + labels in one timestamp-ordered timeline (labels applied at
   their own time, so decay is right) — a flipped or cleared toggle is therefore never a rank-one
   downdate (invariant 6). Labels touch Beta cells only: they name a cell, not a placement, so
   there is no feature vector to put into (A, b) and the blend replay is unchanged. A labelled
   cell is **personal by definition** (rung 2, specs/07 §3.6): the user said so.
3. **One `insights` edge function is the read side.** User JWT → the service's `GET /insights`
   with the backend key (the client never calls the model service) + weekly PAR computed by
   `_shared/par.ts` from `recommendations` + `focus_end` facts under the user's RLS client —
   pre-registered code that shares exactly `PAR_GRACE_MINUTES`/`PAR_MIN_FRACTION` with the reward
   mapping and nothing else (H2; a source-level test asserts no reward column is read) + the
   chronotype class the priors assume. PAR per block is File 06 §1.4 verbatim (session started
   within ±15 min, finished or ≥ 50 % focused); the denominator excludes M-02 displaced rows and
   rows a later plan superseded before their slot (`expired`) **[INFERRED]**; a block whose slot
   has not ended is not yet an outcome. The document is cached in MMKV; the tab renders offline
   and during an outage with an honest "as of" line (NFR-R1). `/insights` gains `beliefs` (one
   per category × day type — the daypart the posterior favours, present even below the affinity
   threshold so there is always something to confirm or correct), per-cell `personal`,
   `learning_mode`, and the label in force; the P5 fields are unchanged (additive contract).
4. **Phrasing follows the rung** (ADR-0010 §11 deferred this to P9): population wording
   ("people like you finish deep work most reliably in the morning…") while a cell is
   prior-dominated, personal wording ("you finish…") once it is personal; the learning-mode badge
   shows while fewer than 50 % of active cells are personal. The weekly review's 2–3 learnings
   are the most confident beliefs; its "tell Hourwell" picker turns the spec's own example
   ("I _am_ a morning person") into a ✓ on the (category, daypart, weekday) cell — the same label
   path, surface `picker`. Closing the review logs `weekly_review_completed` (UC-08 post).
5. **The heatmap is native Views with OKLCH interpolation, not a Skia canvas.** FR-40 is an
   hour × weekday grid; the model resolves dayparts × day types, so the 18 × 7 grid repeats a
   daypart's cell across its hours and a day type's across its weekdays and the legend says so.
   Colour = OKLCH interpolation between the spec's `energyLow` and `energyHigh` tokens
   (Ottosson's OKLab, the math CSS `oklch()` uses — reproducible from the token pair);
   confidence = solidity: the colour is composited over the surface at an alpha that grows with
   effective evidence, `n/(n + 8)` — 0.5 exactly at the rung-2 boundary **[INFERRED]**. Views
   rather than `react-native-skia` (File 03 stack table) **[deviation, engineering + a11y]**:
   126 rectangles need no GPU path, each row grows with the font scale (NFR-A2), and the grid
   exposes one accessible summary (best/lowest daypart per day type) plus a full text view, so
   colour is never the only channel (NFR-A1) — a canvas is one opaque element to a screen
   reader. Skia stays deferred to its first real consumer (a proportional timeline or the focus
   ring), `docs/versions.md`.
6. **The trade-off sheet renders the server's ranking and applies the pick as an ordinary
   edit.** When `plans.telemetry.infeasible.options` is non-empty and this device has not
   answered for that plan, Today shows the options in server order with a consequence sentence
   from the closed metric vocabulary. The pick becomes the matching task edit — `drop`:
   `earliest_start` = tomorrow 00:00 local, `postpone_count + 1`, back to the Inbox; `shrink`:
   `est_minutes − Δ` (floor 15); `move_past_deadline`: `deadline + slip` (min 15); `unpin`: the
   pinned block → `accepted` via a `recommendation_status` op — plus a `tradeoff_decision` fact
   (`plan_id`, kind, rank, Δ, consequence, the alternatives by kind), then a manual re-plan
   ("the user's pick returns as a new /plan call with the option applied"). "Keep it as is" logs
   `tradeoff_rejected` (UC-05 A1, overload state logged) and the sheet does not return for that
   plan. The client never re-scores options. Consequence metrics are rendered, not judged: the
   sheet is a decision surface, not a recommendation.
7. **Analytics stay categorical.** `belief_labeled` (label, cell, surface), `tradeoff_decided`
   (outcome, kind, rank, option count), `weekly_review_completed` (week, counts, trend),
   `insights_viewed` (network/cache/empty, learning mode) — no task text, no percentages of a
   person (NFR-S3).

## Consequences

- Corrections are measurable: the service tests show a label is one prior's worth of
  pseudo-evidence, that the latest label wins and `none` clears without a downdate, that labels
  interleave with tuples by timestamp under decay, and that the bandit sees no label; the Deno
  tests show store-then-deliver survives a service failure; pgTAP shows the trigger, the
  vocabulary guard and RLS. The live round trip (label → sync → `/labels` → `/insights` shows it)
  is the P9 smoke's job and needs the migration on the hosted project (⛔ owner: `supabase db push
--linked` was refused by the session's permission classifier).
- `is_personal` now has a `labeled` input and `learning_mode` a `labeled` set; the rung-2 badge
  can drop on labels alone for a user with few outcomes — intended (a stated belief is personal).
- Thesis text: "high-weight labels" now has a definition (one prior's worth, decaying) and the
  rebuild-on-correction claim extends to labels (thesis-corrections #40); the heatmap deviates
  from File 03's Skia nomination (#41); in-app adherence is the File 06 PAR per ISO week, not a
  reward (#42).
- Revisit: a label on a cell with no outcomes makes the cell "active" only in the rung-2 sense,
  not in the heatmap's evidence solidity (a labelled cell renders at solidity 0.5 by weight,
  which matches the boundary) — fine, but P11 should check that participants' labels do not
  dominate the personal share; the proportional timeline and chunk-level displacement from the
  P9-tagged revisit lines were NOT built this phase (no week view, no Skia consumer) — recorded
  there with the reason.
