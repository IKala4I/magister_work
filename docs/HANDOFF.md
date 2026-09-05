# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-09-05 late evening — **ADR-0020 (no OSF; pre-registration in git; the
> evaluation is a simulation study) and the simulation study itself are done** on branch
> `post-p12/simulation-study` (PR opened by this session; merge when the six required jobs are
> green). The OSF freeze no longer exists as a step anywhere. Build 6 on the Pixel 7a is fully
> verified (previous handoff, kept below in "Build 6 — state"). Read first: `docs/study/
simulation-results.md` "Summary" + §5, then "Exact next actions".

## What happened this session (2026-09-05, 22:00–23:00)

Four commits on `post-p12/simulation-study`, in this order — the order IS the evidence:

1. `35fa6dc` **ADR-0020** + OSF retirement across PLAN, revisit, corrections (#54), rollup,
   spec-conflicts, enrollment checklist, consent clause, privacy README/DPIA triggers,
   runbook, traceability, README, ADR amendments (0008/0010/0011/0015), explainer.
   Wording rule everywhere: **"field study out of scope; evaluation performed in simulation"**.
2. `11b71a9` (22:11:53) **`docs/study/preregistration.md`** — hypotheses, directions,
   parameters, analysis plan for E1/E2/E3, analytic ceilings; no study code in the tree.
3. `ec1b869` (22:19:16) **`training/src/hourwell_training/simstudy/`** + `hourwell-simstudy`
   CLI + 11 tests (90 pytest, ruff, mypy strict green).
4. `f2c3692` **the registered run** (`docs/study/results/*.json`, run on `ec1b869`: E1
   23.8 s, E2 10.6 s, E3 41.3 s, 8 workers) + `docs/study/simulation-results.md` +
   corrections #55, spec-conflicts M10 + M9 closure, revisit ×2, CHANGELOG, traceability ×4,
   PLAN tail, explainer results section, this handoff.
5. (this commit) **adversarial pass addressed** (fresh subagent: 2 MAJOR / 10 MINOR / 4
   NOTE): the E2 heterogeneity was under-registered (τ ≈ 0.10, not 0.12 — at 0.12 the paired
   floor is 0.77 / 0.74 at N = 30; results §4.2, §5 item 0) and E2's seeding deviates from
   §1.3 — both reported as deviations, no re-run; E3-H7 → ◐; three service imports replace
   inlined code with a byte-identical E3 re-run as proof; 5 new tests (95 pytest) incl. the
   `_learn` ≡ `feedback.rebuild_all` equivalence; `training/scripts/simstudy_exploratory.py`
   reproduces the post-results analyses (`results/exploratory.json`).

Results in one line: learned arm +2.5 pp (base world, ceiling 4.1) / +5.4 pp (amplified,
ceiling 7.8), direction right in 96 % / 100 % of replicated studies; File 06 power 0.84 / 0.82
at N = 30 under the registered τ ≈ 0.10 (0.77 / 0.74 at File 06's 0.12 → N ≈ 34–40, the finding
the owner should weigh for the thesis text); every estimator except replay unbiased; five
things came out differently and are reported as such (results §5): the E2 heterogeneity,
replay bias under a variable |A_m(x)| (M10), morning types lose 1–2 pp under the learned arm,
H4 underpowered within-study, mis-specified criteria.

## Exact next actions (next session, in order)

1. **Merge the `post-p12/simulation-study` PR** if auto-merge has not (six required jobs; the
   `train.yml` synthetic job is path-filtered and will run because `training/**` changed).
2. **Thesis-text support** (corrections 1–55 + rollup). #54 = the decision + wording rule; #55
   = the simulation study as §5 content with the deviations intact. Grep the draft for "no
   study", "not executed", "не проводиться" (rollup sanity list).
3. **iPhone pass — scoped below, owner's call on timing.** Nothing else is queued before it.
4. Optional owner items: erase the test account on the Pixel 7a (FR-42 from Settings); a
   third NFR-P1 series on build 6 (revisit).

## iPhone pass — scope, what it needs from the owner, how long (scoped 2026-09-05)

**Status of the iOS rows:** the checklist header promises "one physical iPhone and one
physical Android"; Android is closed, iOS never ran on hardware. iOS rows are out of scope for
the _study channel_ (store decision, metadata §7) but not for the verification claim — the
pass converts ≈ 10 "iOS pending" rows and the two iOS-only ones (real suspension for the lazy
lapse scan and the UC-03 day boundary; VoiceOver; Dynamic Type + Reduce Motion/Transparency;
Files/AirDrop export; local-notification delivery under Focus modes). No thesis claim depends
on it; the device-checklist "Pass status" paragraph does.

**Devices seen by this Mac (`xcrun devicectl list devices`):** an **iPhone 13** (A15, 2021)
and an **iPhone 12** (A14, 2020), both previously paired, both currently disconnected. The
iPhone 13 is the better reference (closer to the 2022 device class NFR-P2 names; still faster
than a mid-range Android — say so, as for the Pixel 7a). Needed: which one, and its iOS
version (≥ 16 required by File 06 §1.3; ≥ 17 changes the tooling — `devicectl` only).

**What it needs from the owner (⛔ items, one per turn as usual):**

1. The phone connected by cable, unlocked, "Trust this computer" accepted; **Developer Mode**
   on (Settings → Privacy & Security → Developer Mode; reboots the phone). 10 min.
2. An **Apple ID signed into Xcode** (Xcode → Settings → Accounts; the free personal team is
   enough — no Developer Program, no payment). ⛔ login, 5 min. Bundle id `com.hourwell.app`
   registers under the personal team on first build.
3. After the first install: approve the developer certificate on the phone (Settings →
   General → VPN & Device Management) — the "Untrusted Developer" prompt. 2 min.
4. The phone stays the session's during automated slices; the owner does the hands-on slices
   listed below. Re-sign (one command, phone connected) every **7 days** if observations run
   longer.

**What the session can drive vs. what the owner must do (the iOS asymmetry):** there is no
`adb` equivalent — no shell, no `dumpsys notification/alarm`, no `uiautomator`, no `am kill`.
The session builds and installs (`npx expo run:ios --device --configuration Release`, Sentry
upload disabled as in P2), launches/terminates the process (`xcrun devicectl device process
launch`), reads the server side (plans, events, `notification_response`, sync rows), and times
cold starts with `xctrace` (App Launch template, 20 launches). Screenshots and everything
notification-, lock-screen- or Settings-related are the owner's fingers (Xcode's Devices window
or the side-button screenshot + AirDrop). Maestro 2.8.0 is installed; whether it drives a
physical iPhone is verified on the day — if not, the e2e sweeps become owner taps +
screenshots, as the a11y-maxscale evidence was on Android.

**Plan and time (modelled on the Android pass, which took five days including a fix batch):**

| Step      | Who                    | Content                                                                                                                                                                                                                                                                                                                                                                                 | Time                                                 |
| --------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 0         | owner                  | items 1–3 above                                                                                                                                                                                                                                                                                                                                                                         | 15–30 min                                            |
| 1         | session, owner present | Release build → install → onboarding → first plan; backend proof (Settings write read back); cold-start series (`xctrace`, 20 launches); bundle-host gate as `hw-build-gate.sh`                                                                                                                                                                                                         | 45–90 min (first-time provisioning hiccups included) |
| 2         | owner, session guiding | full day loop (focus, skip, move picker, undo 6 s), **VoiceOver listening pass** (≈ 30 min), Dynamic Type max + Reduce Motion + Reduce Transparency sweep with screenshots (≈ 20 min), export via the share sheet (Files/AirDrop), notification permission + one reminder delivered with the phone locked, the 20:00 ritual to a **force-quit** app (owner swipes it away before 20:00) | 2–3 h, same day                                      |
| overnight | nobody                 | app suspended/jetsammed; the ritual delivered to a dead process; nobody taps                                                                                                                                                                                                                                                                                                            | 0                                                    |
| 3         | session, owner pings   | reconstruct overnight from records; UC-03 `new_day` on the first foreground; the lazy lapse scan after real suspension; background → foreground sync timing (> 10 min in the background)                                                                                                                                                                                                | 30–60 min next morning                               |
| 4         | both                   | **likely a fix batch → build 7 → re-check** (the free-provisioned build, notification categories, the BlurView panels and the iOS share sheet have never run on hardware; Android's first day produced six findings)                                                                                                                                                                    | ½–1 day if needed                                    |

**Total: 2 days elapsed, ≈ 4–6 h of owner attendance, of which ≈ 1.5 h are hands-on tasks the
session cannot drive** (VoiceOver, Settings toggles, share sheets, lock-screen checks), plus
½–1 day if a fix batch opens. Nothing in it costs money.

**Still gated by ⛔ 6 even with the iPhone:** magic-link deep links (mailbox), Google Calendar
consent (Web client), and the **two-device sync row** (File 05 §2 on both phones needs the same
account on both — anonymous accounts cannot be shared; needs magic link or Google sign-in).
Out of scope by the store decision: store-signed binary / TestFlight behaviour, APNs (unused).

## Build 6 — state (2026-09-05 late evening, unchanged)

- **Phone:** build 6 (`7e5e2fd8cef659b0…`), test account `a4c86ab5-f944-43a9-a42d-a65f6d4461d4`
  (anonymous). Device zone / auto time zone / font scale restored (`Europe/Kiev`, on, 1.0). Today
  shows the 13-block plan `3aa1342a`. Five exact block reminders tonight + the Sunday review
  20:00, all `window=0`; nobody taps them. Server profile Mon–Fri 09:00–18:00, sleep 23:00–07:00,
  ritual 20:00, `Europe/Kiev`. FR-42 erasure from Settings is the one-minute clean-up if the
  owner wants the project free of the account.
- **Server:** `plan-request` v13 ACTIVE (owner deploy 20:47 EEST).
- **Recipe (build-6 notes item 9):** a ≥ 10-block list in the evening needs a longer horizon,
  not more tasks — shift the device zone AND the profile zone west, give the day a window,
  HOME → `am kill` → `am start`; `hw-blank-cards-sweep.sh <out> 6 5`. Restore zone +
  `auto_time_zone 1`, font scale, profile zone, `--remove sat`, one more kill + start.
- **Not in the fix batch, by the owner's list (revisit):** stale-ritual re-plans, the
  third-skip diagnostic card persistence, heatmap label rough edges, the Move picker's silent
  snapping.

## Where we are

- **P0–P12 merged** (PRs #1–#30); post-P12: hardware pass days 1–5 (PRs #31–#50), fix batch →
  build 6 (#51), 13-block sweep (#52), **this PR: ADR-0020 + the simulation study**.
- **Decisions in force:** store accounts — buy neither (2026-08-31); the field study is out of
  scope (2026-09-01); **no OSF, pre-registration in git, the evaluation is a simulation study
  (2026-09-05, ADR-0020)**; NFR-P1 = ≤ 6.0 s p95 on a 2022 low-end Android over a weak link,
  reference 3.7–4.1 s on the Pixel 7a (2026-09-04).
- **Docs current:** PLAN (§5 row 12, tail), CHANGELOG, traceability (+4 rows), revisit (+2),
  spec-conflicts (M10, M9 closure, 2026-09-05 overlay), corrections #54–#55 + rollup,
  explainer (decision, pre-registration, code, results), device-checklist unchanged.

## ⛔ ACTION REQUIRED (owner — ordered; one per turn)

1. ✅ Migration push (2026-08-31). 2. ✅ Role activation (2026-08-31). 3. ✅ DPIA signed
   (2026-09-01). 4. ✅ Store economics decided — no accounts (2026-08-31). 5. ✅ Hardware pass,
   Android, days 1–5 (closed 2026-09-05); build-6 re-check ✅; **iOS: scoped above, not started**.
2. **Hardware-pass prerequisites only** (re-scoped by #49): the Google OAuth second Web
   client and a real mailbox matter only for the device-checklist auth/calendar items and the
   two-device sync row; PostHog EU / Sentry EU optional.
3. ~~Pre-enrollment list~~ — retired-conditional (#49). ~~OSF freeze~~ — **retired (ADR-0020,
   2026-09-05)**: no registration; the material stays in-repo; the simulation study carries
   the pre-registration discipline in git.

## Gotchas (this session's additions; earlier lists in git history of this file still apply)

- **Pre-registration order matters and is checkable:** `git log --format='%h %ad %s' -- docs/study/preregistration.md training/src/hourwell_training/simstudy docs/study/results` must show the file before the code before the results. Never amend those commits.
- **`hourwell-simstudy --quick` writes `*_quick.json`** — never into `docs/study/results/`
  proper; the registered run is the only unsuffixed output and takes ≈ 80 s with 8 workers.
- **A `zip(strict=True)` inside `all()` only raises when nothing short-circuits** — the tiny
  test passed and the full replicate crashed. Keep list lengths explicit.
- **The exploratory analyses live in `training/scripts/simstudy_exploratory.py`** (seeds inside;
  the σ² diagnostic patches `sample_thetas` in BOTH modules that bind the name — patching one
  silently runs the registered σ²). Re-run with `--out ../docs/study/results`.
- **Branch protection is on `main`** (six required CI jobs; auto-merge on) — `gh pr merge
--auto --merge` waits for CI.
- **Prettier pads markdown table cells** — scripted edits anchor on cell content, then
  `pnpm format`.
- **`am kill` keeps alarms, `am force-stop` cancels them** (Android; unchanged).

## Open questions (owner)

- Two-device ritual (unchanged from P10; several revisit lines wait on it).
- Whether to run the iPhone pass at all (scoped above; optional for the thesis claims).
