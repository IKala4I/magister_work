# 02 — Product Design & Requirements

> **Project:** Kairos — Personal Time Optimization via Recommendation Systems
> **Document:** Audience, Value Proposition, UI/UX System, FR/NFR, Use Cases
> **Status:** v1.0 (SDD Phase 1) · Traceability: FR/NFR IDs referenced by `03_technical_architecture.md`

---

## 1. Target Audience

### 1.1 Primary Personas

**P1 — "Overloaded Knowledge Worker" (Daryna, 29, product designer, hybrid work).**
Juggles meetings + deep work + life admin across Google Calendar and sticky notes. Tried Motion, quit over price and "robotic reshuffling." Wants: a believable daily plan she'll actually follow. Pain: schedules creative work after lunch, when she's cognitively flat, and doesn't realize it.

**P2 — "Ambitious Student / Early Researcher" (Marko, 23, Master's student + part-time job).**
Deadline-driven, irregular days, chronic deadline compression. Wants: the app to fight his procrastination *with* him, not shame him. Pain: knows *what* to do, never *when*; every planner he's tried assumed a 9-to-5 he doesn't have.

**P3 — "Structure-Seeker" (Olena, 34, freelancer, self-described ADHD-adjacent).**
Needs external structure, but rigid plans trigger abandonment. Wants: gentle, adaptive replanning; forgiveness built in. Pain: one missed block used to cascade into a written-off day.

### 1.2 Explicit non-targets (v1)
Teams/shared scheduling, meeting coordination, enterprise admin. Kairos v1 is **single-player by design** — the personal model is the product.

## 2. Core Value Proposition

> **"A planner that learns you."** Kairos observes when you *actually* complete things, learns your energy rhythms and task affinities, and builds each day's plan around the real you — then explains every choice in one sentence and adapts without judgment when life happens.

Three promises, in priority order: **(1) Believable plans** (probability-optimized, not just conflict-free), **(2) Zero-guilt adaptation** (a skip is a data point, not a failure), **(3) Legible intelligence** (every recommendation carries a "because…").

---

## 3. UI/UX Strategy

### 3.1 Visual Direction: **"Calm Precision"**

Style: **clean minimalism with restrained glassmorphic depth** — *not* neo-brutalism. Rationale: a productivity app lives in daily high-frequency, low-attention moments; the interface must lower cognitive load, not perform personality. Neo-brutalism's high-contrast noise fights the core promise of calm. We take 2025–26 mainstream cues — generous whitespace, bento-grid dashboards, soft depth (frosted panels at 8–12 px blur used *only* for the recommendation layer, so "what the AI suggests" is visually distinguishable from "what you fixed"), large rounded radii (16–20 px), tactile micro-interactions — while aligning with **Material 3 (Expressive)** on Android and Cupertino idioms on iOS via a shared token system.

A key semantic device: **confidence = solidity.** High-confidence recommendations render nearly opaque; exploratory suggestions (bandit exploration arms) render lighter/glassier with a subtle dashed border. The UI *is* the explanation layer of the ML system.

### 3.2 Color Palette

| Token | Light HEX | Dark HEX | Usage |
|---|---|---|---|
| `primary` | `#4F46E5` (indigo) | `#818CF8` | Actions, active states, brand |
| `primary-container` | `#E0E7FF` | `#312E81` | Selected chips, recommendation cards |
| `surface` | `#FAFAF8` (warm off-white) | `#0F1115` | App background |
| `surface-elevated` | `#FFFFFF` @ 92% + blur | `#1A1D24` @ 88% + blur | Glass panels, sheets |
| `text-primary` | `#1A1D29` | `#EDEEF2` | Body/headlines |
| `text-secondary` | `#5B6070` | `#9AA0AE` | Metadata, rationales |
| `energy-high` | `#F59E0B` (amber) | `#FBBF24` | Peak-energy visualization |
| `energy-low` | `#94A3B8` (slate) | `#475569` | Low-energy visualization |
| `success` | `#10B981` | `#34D399` | Completions, streaks |
| `warning` | `#F97316` | `#FB923C` | Conflicts, at-risk deadlines |
| `danger` | `#EF4444` | `#F87171` | Destructive actions, missed hard deadlines |
| `focus-gradient` | `#4F46E5 → #7C3AED` | same | Focus-session timer ring |

Energy heatmaps interpolate `energy-low → energy-high` perceptually (OKLCH interpolation, not raw RGB). All pairings meet WCAG 2.2 AA (≥4.5:1 body text).

### 3.3 Typography

- **UI & headings:** **Inter Variable** (open source, SIL OFL) — optical sizing on, tight tracking at display sizes. Scale (mobile): Display 32/38, H1 24/30, H2 20/26, Body 16/24, Caption 13/18.
- **Numerals & timers:** **JetBrains Mono** (tabular figures) for countdowns, durations, stats — prevents layout jitter and gives the "instrument" feel.
- System-fallback stack (`SF Pro` / `Roboto`) behind Inter for cold-start performance.

### 3.4 Motion & Interaction Principles

1. **Physics, not flourish:** spring-based transitions ≤ 250 ms; reduced-motion honored (NFR-A2).
2. **Drag = teach:** dragging a suggested block to another slot is a first-class negative/positive feedback pair (logged as such — see File 3 §3.4).
3. **One-thumb reachability:** all primary actions in bottom 60% of screen; bottom-sheet-first navigation.
4. **Forgiving defaults:** destructive actions undoable for 6 s; "skip" never uses red.

### 3.5 Key Screens (v1)
Today (timeline + glass recommendation blocks) · Inbox (unscheduled tasks) · Focus (timer + session rating) · Insights (energy heatmap, adherence trend, "what I've learned about you") · Onboarding (chronotype micro-survey) · Task sheet (create/edit, NL input).

---

## 4. Functional Requirements

Priority: **M**ust / **S**hould / **C**ould (MoSCoW). IDs are stable and referenced from File 3.

### 4.1 Accounts & Onboarding
- **FR-01 (M):** Sign-up/sign-in via email magic-link and Google OAuth; anonymous trial mode convertible to full account.
- **FR-02 (M):** Onboarding captures: working-hours template, sleep window, chronotype micro-survey (5 items, MEQ-derived), top task categories. Completable in <3 min; every answer skippable.
- **FR-03 (M):** Optional read/write sync with Google Calendar (busy-time import mandatory for scheduling around fixed events; write-back of Kairos blocks opt-in).

### 4.2 Task Ingestion & Management
- **FR-10 (M):** CRUD for tasks with: title, category, estimated duration, deadline (optional), value/priority (1–3), splittable flag, earliest-start.
- **FR-11 (M):** Natural-language quick-add ("report draft 2h by Fri") parsed on-device.
- **FR-12 (S):** Recurring tasks & habits (e.g., "gym 3×/week") with flexible placement.
- **FR-13 (C):** Import from Todoist/TickTick (CSV/API) to de-risk switching.

### 4.3 Scheduling & Recommendations (core)
- **FR-20 (M):** Generate a daily/weekly plan: ranked assignment of tasks to feasible slots respecting hard constraints (fixed events, deadlines, working hours, sleep).
- **FR-21 (M):** Each placement displays a one-sentence rationale derived from model features ("You finish admin fastest right after lunch").
- **FR-22 (M):** Visual confidence encoding per block (see §3.1) including explicit "experiment" labeling for exploration arms.
- **FR-23 (M):** Missed/expired blocks are automatically re-planned at next planning event; the skip is logged as feedback, never as an error state.
- **FR-24 (M):** Conflict resolution: when constraints are unsatisfiable (over-committed day), present a ranked trade-off sheet (drop / shrink / move-past-deadline options with consequences) — the user decides; choice is logged.
- **FR-25 (M):** Full manual override: pin, move, resize, reject any block; overrides are first-class training signals.
- **FR-26 (S):** "Plan tomorrow" evening ritual notification with one-tap accept/adjust.
- **FR-27 (C):** What-if preview: "if I add this 3 h task, what gets displaced?"

### 4.4 Focus & Feedback Loop
- **FR-30 (M):** Focus session per block: start/pause/finish/abandon, with duration telemetry.
- **FR-31 (M):** Post-session micro-feedback: 1-tap energy/difficulty rating (optional, ≤2 taps, never modal-blocking).
- **FR-32 (M):** Implicit feedback capture: completion, completion latency, skip, postpone count, reschedule distance, drag corrections, notification response.
- **FR-33 (S):** Weekly review: adherence stats + 2–3 model-derived insights + option to correct wrong learnings ("actually, I *am* a morning person").

### 4.5 Insights & Trust
- **FR-40 (M):** Energy heatmap (hour × weekday) of the learned completion-probability model.
- **FR-41 (S):** "What Kairos believes about you" screen: top learned affinities in plain language, each with a correct/incorrect toggle (direct model feedback).
- **FR-42 (M):** Data export (JSON) and full account deletion in-app (GDPR Art. 17/20).

### 4.6 Notifications
- **FR-50 (M):** Block-start reminders with smart lead time; per-category mute; hard daily cap (≤5) to prevent notification fatigue.
- **FR-51 (C):** Bandit-optimized notification timing (thesis extension; ships behind a flag).

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-P1 | Performance | Plan generation ≤ 2.5 s p95 end-to-end (warm backend); optimistic UI while computing |
| NFR-P2 | Performance | Cold app start ≤ 2 s p90 on a 2022 mid-range device; 60 fps timeline scrolling |
| NFR-P3 | Performance | Core read/write API ≤ 300 ms p95 (excluding ML planning endpoint) |
| NFR-R1 | Reliability | Offline-first: view plan, edit tasks, run focus sessions offline; sync + conflict resolution (last-write-wins with event-log reconciliation) on reconnect |
| NFR-R2 | Reliability | Graceful ML degradation: if the RecSys service is cold/unreachable, fall back to deterministic heuristic scheduler, labeled as such (feeds baseline data — a feature, not just a fallback) |
| NFR-S1 | Security | All traffic TLS 1.3; Supabase Row-Level Security on every table; JWT (asymmetric) auth; no service keys in the mobile client |
| NFR-S2 | Privacy | GDPR by design: data minimization (no content beyond user-entered task text), EU region hosting, export & erasure (FR-42), no third-party ad/tracking SDKs |
| NFR-S3 | Privacy | Cross-user (collaborative) training uses only pseudonymized categorical/behavioral features — never raw task text |
| NFR-Sc1 | Scalability | Architecture serves 10 k MAU within free tiers; documented migration path to ~$25–50/mo at 50 k MAU (File 3 §2.2) |
| NFR-M1 | Maintainability | ≥ 70% unit-test coverage on scheduling/feedback domain logic; CI gates on lint + tests |
| NFR-A1 | Accessibility | WCAG 2.2 AA: contrast, ≥44 px touch targets, full screen-reader labels incl. chart alternatives |
| NFR-A2 | Accessibility | Honor OS reduced-motion & font-scaling up to 200% without layout breakage |
| NFR-O1 | Observability | Crash reporting + structured event analytics with model-version tagging on every recommendation event (enables offline replay — RQ4) |

## 6. Use Cases

Format: **ID · Title — Actor / Trigger / Precondition → Main flow → Alternates → Postcondition**. (Traceability to FRs in parentheses.)

**UC-01 · First-run onboarding** — New user / app install / none.
Main: welcome → chronotype micro-survey (5 taps) → working hours & sleep window → optional Google Calendar connect → 3 seed tasks prompted → first "learning-mode" plan generated with population-prior confidence labels.
Alt: A1 user skips survey → defaults + wider exploration budget; A2 declines calendar → scheduling within self-declared hours only.
Post: profile persisted; cold-start priors selected (FR-01/02/03; File 3 §3.6).

**UC-02 · Quick task capture** — User / taps ➕ or types NL string.
Main: "finish thesis intro 90m by tue" → on-device parse → structured preview chip → confirm → task in Inbox; if today's plan has slack, immediate placement suggestion appears (glass block).
Alt: A1 parse ambiguity → inline chips to disambiguate; A2 offline → queued, syncs later (NFR-R1).
Post: task persisted + `task_created` event (FR-10/11).

**UC-03 · Daily plan generation** — System (06:00 local or first open) / new day.
Main: fetch fixed events → enumerate feasible slots → RecSys ranks (task, slot) pairs → assignment rendered with rationales & confidence; user accepts or adjusts.
Alt: A1 ML backend cold (free-tier sleep) → heuristic fallback plan, tagged `engine=heuristic` (NFR-R2); A2 empty inbox → habit/recurring fill only.
Post: `recommendation_shown` events logged with model version & feature snapshot (FR-20/21/22; NFR-O1).

**UC-04 · Missed-task rescheduling (the forgiveness loop)** — System / block end time passes with no completion.
Main: block marked *lapsed* (neutral styling) → skip-feedback event logged with context → at next planning event the task re-enters ranking, its (task-type, slot-context) score demoted by the bandit update → new placement, rationale mentions the change ("moving this earlier — afternoons haven't worked for it").
Alt: A1 user marks "actually did it" → converts to completion, reverses the update; A2 third consecutive skip → app asks one diagnostic question (too big? wrong time? not important?) → answer routes to split-suggestion / affinity update / archive suggestion.
Post: model updated online; no guilt UI anywhere (FR-23/32).

**UC-05 · Conflict resolution (over-committed day)** — User adds urgent task / constraints unsatisfiable.
Main: solver detects infeasibility → trade-off sheet: ranked options with consequences (e.g., "move Gym → Thu (streak safe)", "shrink Deep Work to 60 m (−18% est. completion)", "push Report past soft deadline") → user picks → plan rebuilt.
Alt: A1 user rejects all → manual edit mode; overload state logged.
Post: decision logged as preference signal over constraint priorities (FR-24).

**UC-06 · Focus session with feedback** — User / taps Start on a block.
Main: full-screen timer (focus-gradient ring) → finish → 1-tap energy rating → completion + duration + rating logged → streak/adherence updated.
Alt: A1 abandon at <50% → partial-credit reward (File 3 §3.4); A2 overrun → actual duration updates the task-type duration estimator.
Post: reward signal enqueued for bandit update (FR-30/31/32).

**UC-07 · Manual override as teaching** — User / drags suggested block to a new slot.
Main: drag → haptic snap → placement updated → paired feedback logged (negative for origin slot, positive-weak for target) → optional toast: "Got it — you prefer calls later. Keep learning this?"
Post: override event with both contexts persisted (FR-25/32).

**UC-08 · Weekly review** — User / Sunday-evening notification (FR-26 cadence).
Main: adherence trend, energy heatmap delta, 2–3 plain-language learnings each with ✓/✗ correction toggle → corrections applied as high-weight labels.
Post: model priors adjusted; review-completed event (FR-33/40/41).

**UC-09 · Calendar sync & external conflict** — System / Google Calendar webhook or poll detects a new meeting overlapping a Kairos block.
Main: displaced task auto re-enters planning → replacement suggestion notification (respecting FR-50 cap) → silent repair if user ignores.
Post: plan consistent with external calendar ≤ 5 min after change (FR-03/23).

**UC-10 · Privacy exercise** — User / Settings → "My data".
Main: export JSON (tasks, events, learned parameters) or delete account → deletion cascades DB rows + model artifacts ≤ 30 days, confirmed by email.
Post: GDPR Art. 17/20 satisfied (FR-42; NFR-S2).

## 7. Out of Scope (v1)
Team scheduling & shared calendars · meeting-time negotiation · email/Slack ingestion · desktop/web client (read-only web C-priority) · wearable/HRV energy signals (thesis "future work" chapter) · LLM chat interface over the planner.

---

*Next: `03_technical_architecture.md` — stack, RecSys engine math, data schema.*
