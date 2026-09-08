# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-09-08 (evening) — **iPhone pass, day 2 closed on branch `post-p12/iphone-pass`;
> build 2 on the phone; PR open with auto-merge.** Read first:
> `docs/verification/device-pass/ios-20260908-1215/notes.md` (items 50–68 + the fix-batch table
> with the build-2 results), then the "iOS 2026-09-08" paragraphs and the "Fix-batch rows only
> hardware can settle" section in `docs/verification/device-checklist.md`.
>
> **Commits on the branch since day 1:** `8d07c00` day-2 records → `1ed0be0` F3 → `33f8f81` F4 →
> `607d782` F1 → `415635a` F2/F5/F6/F7 → `5308199` records → `36b297c` adversarial follow-ups →
> `aaef65e` `persist_plan` migration (pgTAP 7/7 linked) → `1afd4b8` records → the stale-session
> reward fix (client fact `reason: 'stale'` + the mapping gives it no credit) → the build-2
> records. **Build 2 = `36b297c` on the phone** (the stale-session fix is not in it — no device
> check needs it before main).
>
> **⛔ Owner items (in order, one per turn):** (1) restore the brightness (my blind slider write
> landed on Display & Brightness — notes item 68) and, at the very end, Auto-Lock; (2) push the
> migration `20260908140000_persist_plan_facts_beat_supersede.sql` (`supabase db push`, as for
> P10/P11); (3) 2-minute VoiceOver listen on Today: a card's rotor must list Start / Done / Skip /
> Move… (or "I did it"), a double-tap runs it, the summary ends with the state; (4) 1-minute
> Larger Text check through the Settings app with Hourwell in the background (the path that
> clipped build 1) — Inbox rows and the Today header must be laid out, not clipped; (5) the
> erasure with the arming test: `! docs/verification/hw-ios-erase-check.sh <out-dir>` with
> Settings open on "Delete account and data" and a WDA session alive (the session sets it up);
> then the session reads `deletion_audit` +1 and the tables at 0.

## What happened this session (2026-09-08 — iPhone pass, day 2)

Phone untouched by the owner overnight; the USB link had dropped at 17:33 the evening before
(replugged 12:15). **Read before the phone was touched:** the app frozen all night (never
killed); the phone's keybag unlocked three times (21:38, 21:53, 12:00) without the app running;
the **ritual fired a second time at 20:00** (FR-26 defect confirmed — item 51, refined by item
62: the ledger trusts the OS's delivered list, and an answered notification leaves it); the
morning's four nudges fired 08:50–11:05 to the frozen app; the daily authority attributed the
7th at 00:00:03 local; the nightly training promoted `als/1` and backfilled propensities on 79
rows (the 12 slice rows exact, invariant 9 held) — bumping `server_seq`, which set up the day's
MAJOR.

**On the device:** the day's first foreground was the owner's (the unlock swipe returned to
Hourwell; recorded as such, reads taken as they are): Today = the ritual's plan, **zero plan
requests** (UC-03, accepted-ritual branch), five lapses (the 7th's 17:00 experiment block 18.9 h
late + today's four). **MAJOR (item 55):** the same sync's pull re-fetched the backfilled rows
and reverted the four local `lapsed` to `shown`; the next `active` transition lapsed them again —
duplicate facts, double-counted streaks, the third-skip diagnostic on a task that missed twice.
Mechanism from the code (`pull.ts` upserts status unless an unacked `recommendation_status` op
protects the id; the lapse path pushes only the fact; the server keeps `shown` until the daily
job). A clean cycle lapsed one block once. Reminder ledger reset at the day boundary (four
delivered + ritual = five; no afternoon nudge). FR-30 across a 10-min lock and a kill — PASS.
A ritual under Do Not Disturb — delivered silently, listed after Focus ended. Erasure + arming
test deferred to the end of the pass (auto-mode blocks hosted deletes; the account is needed for
build 2's re-checks).

**Tooling (day 2):** `syslog collect` + `log show` on the locked phone is the overnight tool;
`dvt screenshot` of a dark screen is black (a screenshot loop around the owner's tap-to-wake
catches the lock screen); WDA drags scroll only when they START inside the list and last
≈ 0.25 s (longer = a press; the footer is outside the list); the block action row is not in
today's XCUITest trees (coordinates); zsh needs `W=(python3 …)` arrays; `scroll-to` stalls on
Today too, not only on the sheet.

## Exact next actions (this session continues; or a fresh one after `/clear`)

1. ~~Fix batch F1–F8~~ done; ~~build 2 + re-checks~~ done (notes items 65–68: F3 ✅, F1 ✅,
   F2 state ✅, F5 layout ✅ via the daemon / Settings path owner; F4 needs a day with budget).
   The owner items above come next; then the pass closes with a docs commit flipping the
   remaining rows (rotor listen, Larger Text, erasure) and the PR merges.
2. ~~**Build 2**~~ (see above; the exact command that worked: `SENTRY_DISABLE_AUTO_UPLOAD=true npx expo run:ios --device 00008101-0015081602F1003A --configuration Release --no-bundler` with the WDA runner and the live syslog STOPPED — both hold the CoreDevice connection xcodebuild needs — and the phone unlocked; a wedged RSD (0xE8000003) is cleared by `pymobiledevice3 diagnostics restart` + the owner's first unlock) (`npx expo run:ios --device 00008101-0015081602F1003A --configuration Release
--no-bundler` after `expo prebuild`; `hw-build-gate-ios.sh`), install over build 1 (same
   account, same data), re-check each row of the table on the phone with the same drivers;
   flip the checklist rows; day-2 notes items 64+.
3. Then, on the same account: the arming test (`wda-doubletap.py` — owner-run if the
   classifier blocks) → the erasure → `deletion_audit` +1 → welcome after a cold relaunch.
4. Phase report, PR `post-p12/iphone-pass` → main (auto-merge once after `gh pr create`).
5. Optional owner items: the calendar consent retry on the iPhone with the Pixel's Google
   account (then the disconnect dialog, site 2); the client-side NFR-P1 PostHog export.

## What happened this session (2026-09-07 — iPhone pass, day 1)

Owner's device: iPhone 12 (A14, 2020), iOS 26.6, personal team, Developer Mode on. PR #56 had a
red TypeScript gate (the dialog's arming test raced a slow runner) — pinned to a frozen clock,
merged. Free-provisioning finding fixed at the source: the expo-notifications plugin writes
`aps-environment`, which a personal team cannot sign → `apps/mobile/plugins/withoutApsEnvironment.js`
(listed before expo-notifications; mods run last-listed-first). Build 1 installed, gated
(`hw-build-gate-ios.sh`), trusted by the owner.

**Tooling (all in `docs/verification/`, all verified on the phone):** Maestro does not run on
physical iPhones; the accessibility daemon's "Activate" does not fire RN Pressables → real
touches come from **WebDriverAgent** built with the personal team (`hw-ios-wda.py` over
`pymobiledevice3 usbmux forward 8100 8100`; the runner must be started while the phone is
unlocked); the **accessibility daemon** (`hw-ios-ax.py`) reads the VoiceOver order with spoken
strings, holds Reduce Motion / Reduce Transparency / Increase Contrast / Dynamic Type while a
client stays connected (`hold`), and runs Apple's audits; `pymobiledevice3` gives screenshots
(`developer dvt screenshot`), the live syslog, the app container (`apps pull`) and the phone's
persisted log archive (`syslog collect` → `/usr/bin/log show --archive`, the after-the-fact
tool: launches, notification fires, foreground/background stamps); `xctrace` App Launch /
Animation Hitches after a phone reboot (`hw-ios-coldstart.sh`; argument order: `--time-limit`
and `--output` BEFORE `--launch --`; never bound an xctrace save). Owner's hands: the trust,
unlocks (WDA cannot unlock this phone), the VoiceOver listen, the calendar consent, the ritual
long-press.

**Verified on the iPhone 12 (checklist "iOS 2026-09-07" paragraphs):** onboarding with the real
keyboard, the first plan, NFR-P1 server side (p50 710 / p95 783 ms), the day loop (Start, Finish with a
rating, Skip, the wheel-picker Move, the 6 s undo), Insights (heatmap, text alternative, a
belief label), the export through the share sheet into Files, the three dialogs' VoiceOver
order and a clean audit, cold start (p50 488 / p90 503 ms; 0.95 s after a reboot), zero hitches
on a real thumb scroll, the pull on the first foreground after a 44-min suspension, FR-50 (five
in the day, the OS's own schedule as evidence, the 14:20 nudge captured on the lock screen),
FR-26 to a killed app with the category actions ("Plan tomorrow" cold-started the app → one
`evening_ritual` plan for the 8th + one `notification_response` fact).

**Findings (fix batch → build 2):** MAJOR — under Reduce Motion (the system switch) the second
erasure dialog never appears (notes 24, 36; mechanism hypothesis: the Modal is unmounted and
re-mounted within one tick; keep it mounted across an immediate replacement). MAJOR — the block
action row is unreachable by a screen reader on both platforms (`ConfidenceBlock`'s
`accessible` wrapper; custom actions; notes 35, 41). A live text-size change re-renders text
without re-laying out (200 % clips/overlaps; fresh launch correct; re-mount on font-scale
change; notes 22, 23, 36). Systemic "default before the first read" (Settings calendar /
permission, Inbox, Focus, the task sheet) — shared fix: synchronous first read in
`useLiveRows` + a last-known-value hook for the tri-states (note 44). The Android calendar
callback screen never leaves on its own (note 43). Possibly a second ritual on one day after
the evening time is moved back (note 49 — read from the log at 20:00).

**Not done on iOS:** the calendar consent (the OAuth client is in Testing; the phone's account
is not a test user; the iPhone attempt never confirmed — note 46 settles the account question
from `auth.sessions` user agents), hence the iOS disconnect dialog (its Android twin captured);
FR-30; Focus modes; the erasure with the double-tap arming test; the client-side NFR-P1
(PostHog export, owner); the two-device rows (⛔ 6).

## Exact next actions as written on 2026-09-07 (superseded above)

1. **Before the owner touches the phone:** read tonight's 20:00 from the live capture
   (`scratchpad/syslog-hourwell-5.log` if the session survived; else `pymobiledevice3 syslog
collect` + `log show`): a "Persistent timer fired" at 20:00 for com.hourwell.app = a second
   ritual on one day (defect); none = the ledger held. Then the lock screen (owner wakes it,
   `dvt screenshot`): tomorrow's 08:50 nudge if the owner is late.
2. **UC-03 + the lazy lapse scan:** the owner unlocks and stays on the home screen; restart
   WDA (unlocked), `app activate` → tree at once: `new_day` (the 8th's plan on Today), the
   lapse facts for the untouched 15:15 / 15:30 / 16:00 / 17:00 blocks (server `events` of the
   lapse type), the ≤ 5 ledger reset. Ritual time is 20:00 again (seq 4909).
3. FR-30: start a block → lock 5 min → unlock → `app terminate` → relaunch → the session
   survives. Focus modes: DND across one nudge (owner, 2 min). Optional: the calendar consent
   retry on the iPhone with the Pixel's Google account, then the disconnect dialog.
4. The double-tap arming test (W3C actions, two taps < 400 ms on "Delete everything") and the
   erasure of this throwaway (`7f088974-…`), reference on screen, audit +1, tables at 0.
5. **Fix batch → build 2** (the findings above; jest first; `pnpm` gates; explainer + ADR /
   spec-conflicts / corrections rows per CLAUDE.md), re-verify the four defects on the phone
   with the same drivers, flip the rows, phase report, PR.
6. Housekeeping: `hw-ios-wda.py session` after every runner restart; `git status` for stray
   `*.trace` in the repo root; the 1 GB log archives stay in scratch.

## What happened this session (2026-09-06, evening — post-p12/in-app-dialog)

Owner request: replace the OS alerts with one in-app dialog, identical on both platforms, on the
File 02 §3 tokens; convert everything we own (the erasure flow included, re-verified on a fresh
throwaway); animate per File 02 §3.4 with reduced motion collapsing to zero (the app's "no
animations" is a divergence to record, not a precedent); mark the calendar-disconnect dialog
device-pending by circumstance (the owner connects a calendar by hand on the iPhone).

Commits, in order: `cec0dcf` dangerText token + destructive Button kind → `b6e5c5a` the dialog
(store + host + tests, six sites converted, jest wiring for Reanimated, explainer) → `ef20781`
records (ADR-0021, spec-conflicts L41/L42, File 02 amendments, audit/traceability/checklist,
revisit, corrections #61) → `c36de47` announce fix → `9593903` **the adversarial-pass fixes**
(one host per presentation context — RN Modal presents from the NEAREST view controller, so the
root-only host would be refused by UIKit under the Settings sheet; 400 ms arming of destructive
confirms against the double tap; focus-only; VoiceOver escape; `onDismiss`; no blink; motion
config from a ref; wider no-Alert scan) → (this commit) hardware + simulator evidence, checklist
flips, CHANGELOG, this handoff.

**Verified on hardware (Pixel 7a, builds 7 → 8, session over adb, `hw-dialog-drive.py` +
`hw-dialog-sweep.sh`):** every dialog is its own window (dump holds only the dialog's nodes);
back / scrim / Cancel dismiss with Settings intact; light/dark × 1.0/2.0 × 540 dpi × landscape
all fit; entrance 150 ms measured from `screenrecord`, reduced motion one frame; the double tap
(two taps in 129 ms) leaves step 2 up; **FR-42 through the dialogs** on throwaway `d2aade77-…`
(two tasks, one plan, two alarms): reference `3192fba6-…` on screen, audit +1 in 113 ms, eight
tables at 0, alarms 2 → 0, welcome after Start over and a cold relaunch (562 ms); a second
throwaway (erased too, `96719cfd-…`) served the double-tap check. **iOS simulator (smoke):** a
Settings-launched dialog presents from inside the sheet (Maestro `e2e/dialog-settings.yaml`
1/1); dark + accessibility-XXXL renders (`e2e/dialog-settings-a11y.yaml`).
**Not established:** TalkBack/VoiceOver spoken order (injected taps are consumed by
explore-by-touch; TalkBack logs no utterances) — owner listening; the iOS escape gesture; the
iPhone erasure; the calendar-disconnect dialog (device-pending, owner's calendar).

## Exact next actions (next session, in order)

1. **Confirm the dialog PR merged** (auto-merge armed once after `gh pr create`; the protection
   blocks anything premature — never re-run `gh pr merge`).
2. **Thesis-text support** (corrections 1–61 + rollup): #58–#60 load-bearing; #61 (transitions
   exist on one surface; no drag physics).
3. **iPhone pass** — scoped below; starts when the owner names the device and iOS version. The
   dialog adds to Step 2: VoiceOver on the erasure dialogs (title read as a header on open, body
   next, actions as buttons, nothing beneath, two-finger Z cancels), Dynamic Type max + Reduce
   Motion on a dialog, the iPhone erasure on a fresh throwaway, and — once the owner connects a
   calendar by hand — the disconnect dialog (site 2).
4. Optional owner item on Android: a 5-minute TalkBack listening pass on the two erasure dialogs
   (structural half done; spoken order open).

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

## Build 8 — state (2026-09-06 evening)

- **Phone:** build 8 (`e553e637ec061fac…`, tree `9593903`, installed 20:58), a fresh anonymous
  welcome-screen session (no onboarding, no plan, no alarms); OS state restored (font 1.0,
  density reset, night off, animator 1, TalkBack off, rotation auto). The build-6 account
  `a4c86ab5-…` was abandoned by `pm clear` (owner decision: fresh throwaway only) — anonymous,
  retention-purge material like the seven session-only rows today (`auth.users` 70 → 77).
- **Simulator:** iPhone 16 has the Release app (tree `9593903`), onboarded, light/medium
  restored. **It hits the same hosted project as the phone** — see gotchas.
- **Server:** `plan-request` v13 ACTIVE; `deletion_audit` 58.

## Where we are

- **P0–P12 merged** (PRs #1–#30); post-P12: hardware pass days 1–5 (#31–#50), fix batch →
  build 6 (#51), 13-block sweep (#52), ADR-0020 + the E1–E3 simulation study (#53), the
  sensitivity study (#54), the narrative rewrite (#55), **the in-app dialog (this branch,
  ADR-0021)**.
- **Decisions in force:** store accounts — buy neither (2026-08-31); the field study is out of
  scope (2026-09-01); no OSF, pre-registration in git, the evaluation is a simulation study
  (ADR-0020, 2026-09-05); **specs are generated assumptions — rewrite on evidence; derived
  numbers follow inputs** (2026-09-06); NFR-P1 = ≤ 6.0 s p95 on a 2022 low-end Android over a
  weak link (2026-09-04).
- **Spec rewrites so far under the 2026-09-06 rule:** File 04 §2.2 (m-weighted replay,
  amendment block), File 04 §3.2 (note on the unmeasured AF/MD ordering), File 06 §2
  (amendment: N follows the simulated effect; the +8 pp / N = 30 pair is an assumption) —
  each recorded in spec-conflicts (M13–M15).

## ⛔ ACTION REQUIRED (owner — ordered; one per turn)

1–5. ✅ (migration, role, DPIA, store decision, Android hardware pass — see git history of
this file). 6. Hardware-pass prerequisites only (Google OAuth Web client, mailbox) — for the
device-checklist auth/calendar rows and the two-device sync row. 7. ~~Pre-enrollment list~~,
~~OSF freeze~~ retired. **8. iPhone pass — waiting for the device and iOS version.**

## Gotchas (this session's additions; earlier lists in git history of this file still apply)

- **The iOS simulator and the phone share the hosted project.** A "newest auth user" read is
  ambiguous while both run — the second erasure's uuid was attributed by elimination because the
  simulator had just created an account. Read the device account's uuid from the device (or
  pause the simulator) BEFORE an erasure; never rely on `--latest` with two clients alive.
- **RN Modal presents from its nearest view controller** (both renderers, RN 0.86.3). Any
  future overlay that must appear above a `presentation: 'modal'` screen needs a host inside
  that screen — `DialogHost` is mounted in Settings and the task sheets for this reason; a new
  native modal screen must mount one too (the a11y audit does not catch a missing host).
- **TalkBack over adb:** with the service on, `input tap` is explore-by-touch (focus), and a
  second injected tap did not activate; TalkBack logs no utterances at its default level.
  Structural evidence = the uiautomator dump; spoken order = a person.
- **Maestro on the simulator cannot dismiss the keyboard** (`hideKeyboard` fails) and cannot walk
  the P4 onboarding at accessibility-XXXL — `dialog-settings.yaml` skips the quick-add;
  `dialog-settings-a11y.yaml` assumes an app onboarded at medium size first.
- **expo-doctor 20/21:** the one miss is TypeScript ~6.0.3 expected vs 5.9.3 pinned (ADR-0004,
  openapi-typescript peer) — pre-existing, listed in `expo.install.exclude`, still reported.

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
