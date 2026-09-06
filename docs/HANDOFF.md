# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-09-06 — **the sensitivity study across simulated worlds is done and
> reported** (branch `post-p12/sensitivity-grid`, PR #54). Power was recomputed from simulated
> effects (owner item 1), the world grid was frozen before the run (item 2), the two loose
> ends are closed in the specs (item 3), the auto-merge gap is closed for good. **The iPhone
> pass is scoped (below) and waits for the owner's device and iOS version.** Read first:
> `docs/study/sensitivity-results.md` "Summary" + §2, then "Exact next actions".

## What happened this session (2026-09-06)

Owner decisions of 2026-09-06 (recorded in CLAUDE.md "Specs are generated assumptions" and the
explainer): specs/01–06 are generated assumptions — rewrite them when measured or simulated
results contradict them and record why; derived numbers follow their inputs, never the claim.

Commits on `post-p12/sensitivity-grid`, in order (the order is the evidence):

1. `2a48a51` (09:30:11) **`docs/study/sensitivity-grid.md` frozen** — world model with every
   bound argued (File 04 §3.2 pattern; the 2025 synchrony-effect systematic review; MEQ worker
   split 28/52/20; File 06's ICC range; the Pixel 7a inbox sizes), 75 cells, verdict
   thresholds, N₈₀ method, predictions S1–S12, the "too kind" and "substantive failure" tests;
   CLAUDE.md rule; explainer. No sensitivity code in the tree. **PR #54 opened here and a
   premature `gh pr merge` was refused** ("6 of 6 required status checks are expected") — the
   proof that the protection fix works.
2. `2ad8a94` (09:34:08) **`simstudy/sensitivity.py`** + CLI `--sensitivity` + 6 tests (101
   pytest); E3's `_plan_day` gained a `q_of` hook, re-run byte-identical.
3. (this commit) **the run** (`results/sensitivity.json`, 301 s on `2ad8a94`) +
   `docs/study/sensitivity-results.md` + File 04 §2.2 rewrite (m-weighted replay) and §3.2
   note, File 06 §2 amendment (N follows the simulated effect), spec-conflicts M11/M12,
   corrections #56/#57, revisit ×2, CHANGELOG, traceability, explainer, this handoff, the
   exploratory diagnostic (`scripts/simstudy_exploratory.py --only int-loss`).
4. `e10a7f5` + follow-up: **adversarial pass addressed** (fresh subagent: 3 MAJOR / 7 MINOR /
   3 NOTE — all on reporting, none on the run): N sentences rewritten to follow their inputs
   (N ≈ 35–70 under σ_shape ≈ 0.6; 30–45 only under a 1.5–2× population effect), S4/S6/S9
   downgraded to ◐ and S12 to ❌ (tally 2 / 5 / 5), the §5.1 diagnostic re-run on the cell's own
   40 seeds with a level-matched-prior setting and SEs (three-way decomposition), slice-aware
   attainable ceilings for all cells (§5.2, `ceilings_attainable.json`), the N₈₀ median rule
   fixed (no number changed), N₈₀ rounded up, two spec notes (SNIPS consistency; File 06 header).

**Results in one paragraph.** 58 WIN / 17 TIE / 0 LOSS over 75 worlds, but the registered
substantive-failure test fires: in the world the cold-start prior was written for (File 04's
pattern at its assumed strength, no individual deviation) the learned policy only ties — the
52 % intermediates and the 28 % morning types lose 1–2 pp each and cancel the evening types'
+5 to +10 pp. Wins are driven by individual deviation from the class profile (σ_shape), not by
the population chronotype pattern; the prior is worth ±0.4 pp. N₈₀ ranges 21 … > 120 across
worlds, > 120 in 48 of 75 cells including the literature-like adult world at the table's
strength; N ≈ 35–70 where σ_shape ≈ 0.6 (depending on day noise), N ≈ 30–45 only where the
population effect is ≥ 1.5–2× the table's on an extreme-heavy sample; N = 30 in no cell. Boundary statement: results §1; thesis text: corrections
#56 (the study) and #57 (N recomputed, File 06 §2 amended).

## Exact next actions (next session, in order)

1. **Merge PR #54** once green. Auto-merge is armed once at creation; never re-run
   `gh pr merge --auto` after a push (Gotchas).
2. **Thesis-text support** (corrections 1–57 + rollup). Load-bearing now: #55 (E1–E3), #56
   (the sensitivity study as the main quantitative contribution — world model, boundary
   statement, the intermediate-type finding), #57 (N recomputed; File 06 §2 no longer fixes
   N = 30; the "N ≈ 35–70 if a pilot shows σ_shape ≈ 0.6, N ≈ 30–45 only under a 1.5–2×
   population effect, otherwise ≥ 120" conclusion).
3. **iPhone pass** — scoped below; starts when the owner names the device and iOS version.

## iPhone pass — scope, what it needs from the owner, how long (scoped 2026-09-05, unchanged)

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

| Step      | Who                    | Content                                                                                                                                                                                                                                                                                                                                             | Time                                                 |
| --------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 0         | owner                  | items 1–3 above                                                                                                                                                                                                                                                                                                                                     | 15–30 min                                            |
| 1         | session, owner present | Release build → install → onboarding → first plan; backend proof (Settings write read back); cold-start series (`xctrace`, 20 launches); bundle-host gate as `hw-build-gate.sh`                                                                                                                                                                     | 45–90 min (first-time provisioning hiccups included) |
| 2         | owner, session guiding | full day loop (focus, skip, move picker, undo 6 s), **VoiceOver listening pass** (≈ 30 min), Dynamic Type max + Reduce Motion + Reduce Transparency sweep with screenshots (≈ 20 min), export via the share sheet (Files/AirDrop), notification permission + one reminder delivered with the phone locked, the 20:00 ritual to a **force-quit** app | 2–3 h, same day                                      |
| overnight | nobody                 | app suspended/jetsammed; the ritual delivered to a dead process; nobody taps                                                                                                                                                                                                                                                                        | 0                                                    |
| 3         | session, owner pings   | reconstruct overnight from records; UC-03 `new_day` on the first foreground; the lazy lapse scan after real suspension; background → foreground sync timing (> 10 min in the background)                                                                                                                                                            | 30–60 min next morning                               |
| 4         | both                   | **likely a fix batch → build 7 → re-check** (the free-provisioned build, notification categories, the BlurView panels and the iOS share sheet have never run on hardware; Android's first day produced six findings)                                                                                                                                | ½–1 day if needed                                    |

**Total: 2 days elapsed, ≈ 4–6 h of owner attendance, of which ≈ 1.5 h are hands-on tasks the
session cannot drive** (VoiceOver, Settings toggles, share sheets, lock-screen checks), plus
½–1 day if a fix batch opens. Nothing in it costs money.

**Still gated by ⛔ 6 even with the iPhone:** magic-link deep links (mailbox), Google Calendar
consent (Web client), and the **two-device sync row** (File 05 §2 on both phones needs the same
account on both — anonymous accounts cannot be shared; needs magic link or Google sign-in).
Out of scope by the store decision: store-signed binary / TestFlight behaviour, APNs (unused).

## Build 6 — state (2026-09-05 late evening, unchanged)

- **Phone:** build 6 (`7e5e2fd8cef659b0…`), test account `a4c86ab5-f944-43a9-a42d-a65f6d4461d4`
  (anonymous). Today shows the 13-block plan `3aa1342a`; five exact block reminders + the
  Sunday review 20:00 (`window=0`); nobody taps them. Server profile Mon–Fri 09:00–18:00,
  sleep 23:00–07:00, ritual 20:00, `Europe/Kiev`. FR-42 erasure from Settings is the
  one-minute clean-up if the owner wants the project free of the account.
- **Server:** `plan-request` v13 ACTIVE.
- **Not in the fix batch, by the owner's list (revisit):** stale-ritual re-plans, the
  third-skip diagnostic card persistence, heatmap label rough edges, the Move picker's silent
  snapping.

## Where we are

- **P0–P12 merged** (PRs #1–#30); post-P12: hardware pass days 1–5 (#31–#50), fix batch →
  build 6 (#51), 13-block sweep (#52), ADR-0020 + the E1–E3 simulation study (#53), **the
  sensitivity study (#54, this branch)**.
- **Decisions in force:** store accounts — buy neither (2026-08-31); the field study is out of
  scope (2026-09-01); no OSF, pre-registration in git, the evaluation is a simulation study
  (ADR-0020, 2026-09-05); **specs are generated assumptions — rewrite on evidence; derived
  numbers follow inputs** (2026-09-06); NFR-P1 = ≤ 6.0 s p95 on a 2022 low-end Android over a
  weak link (2026-09-04).
- **Spec rewrites so far under the 2026-09-06 rule:** File 04 §2.2 (m-weighted replay,
  amendment block), File 04 §3.2 (note on the unmeasured AF/MD ordering), File 06 §2
  (amendment: N follows the simulated effect; the +8 pp / N = 30 pair is an assumption) —
  each recorded in spec-conflicts (M10–M12).

## ⛔ ACTION REQUIRED (owner — ordered; one per turn)

1–5. ✅ (migration, role, DPIA, store decision, Android hardware pass — see git history of
this file). 6. Hardware-pass prerequisites only (Google OAuth Web client, mailbox) — for the
device-checklist auth/calendar rows and the two-device sync row. 7. ~~Pre-enrollment list~~,
~~OSF freeze~~ retired. **8. iPhone pass — waiting for the device and iOS version.**

## Gotchas (this session's additions; earlier lists in git history of this file still apply)

- **Auto-merge gap — root cause and fix (2026-09-06).** PRs #39 and #53 merged with checks
  pending because (a) `gh pr merge --auto` merges _immediately_ when the PR's cached merge
  state still says clean from the previous head, and (b) the classic protection on `main` had
  `enforce_admins: false`, so the owner's admin token bypassed the six required checks.
  `enforce_admins` is now **on** (API, 2026-09-06); proven on PR #54: a premature merge is
  refused with "6 of 6 required status checks are expected" and the merge state reads
  BLOCKED. Rule: arm auto-merge once right after `gh pr create`; never re-run `gh pr merge`
  after a push.
- **Pre-registration order is checkable:** `git log --format='%h %ad %s' -- docs/study/sensitivity-grid.md training/src/hourwell_training/simstudy/sensitivity.py docs/study/results/sensitivity.json`
  must show grid → code → results. Never amend those commits.
- **`hourwell-simstudy --sensitivity` takes ≈ 5 min with 8 workers**; `--quick` writes
  `sensitivity_quick.json`, never the registered filename.
- **The exploratory script patches `sample_thetas` in two modules** (`hourwell_recsys.estimates`
  and `simstudy.e3_closedloop`); `--only int-loss` writes `exploratory_sensitivity.json`.
- **Prettier pads markdown table cells** — scripted edits anchor on cell content, then
  `pnpm format`.

## Open questions (owner)

- Two-device ritual (unchanged from P10).
- The iPhone: which device, which iOS version, when.
- Thesis framing of Q2: the honest reading in results §2 ("worth running at N ≈ 30–45 only if a
  pilot shows σ_shape ≈ 0.6 …") is the recommended wording for #57; the owner decides.
