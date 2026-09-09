# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-09-09 (night) — **post-p12/corrections-rollup** is on the branch and green on
> the format gate. `docs/thesis/corrections-rollup.md` is no longer an index: all 63 items carry
> the Ukrainian sentences the draft should read, grouped by the draft's own chapters, tagged
> Ф / П / С, with every number carrying its measurement condition. **Next phase: writing the
> thesis text** — the rollup is the document to write from.

## What the rollup phase established (2026-09-09)

**The artefact.** `docs/thesis/corrections-rollup.md` (≈ 1 600 lines) in fourteen sections: the
chapter map with a structural verdict per chapter; the numbers ledger and the untraceable list;
the four claims that must survive at full strength; then the paste-ready Ukrainian per chapter,
including the evaluation chapters written **in order**; the amendments the worklist itself needed;
forty findings no correction covered (U1–U40); a source-by-source answer to "does the draft have a
home for this?"; and an order of work.

**Three structural findings** (the answer to "where am I rewriting versus editing"):

1. **Розділ 5 is rebuilt.** It specifies a field study in the future tense and contains none of the
   evaluation that was performed.
2. **A Розділ 6 is needed.** Everything the corrections address to «§6 (обговорення)» (item 59) or
   «§verification» (items 50–53, 62) has **no referent in the draft**. Recommended split: Розділ 5
   «Методика оцінювання», Розділ 6 «Результати оцінювання та їх обговорення», with the device pass
   as §6.6 and `spec-conflicts.md` as §6.8. The alternative (keep five chapters, grow Розділ 5 to
   eleven subsections) is named in §1 of the rollup; the owner picks.
3. **§1.4's research-gap argument no longer holds.** It rests on the work occupying all seven
   dimensions D1–D7 including a deployed field evaluation. D7 is now ◐, and the gap must be
   re-argued over six dimensions with D7 stated as open.

**Six worklist entries were wrong and are amended in place** (dated lines in
`thesis-corrections.md`): #20 (propensity constant from the superseded eligibility rule — the
deployed value is p = ε/|A_m(x)|), #47 (the device measurement it promised was never taken; NFR-P3
still has no handset number), #50 (the fix was server-side; the device still sends `Europe/Kiev`),
#51 (self-contradictory reference figure; a modelled decomposition sum presented as measured),
#55 (E3's 2.5 / 5.4 pp are properties of one world), #62 (four positive claims overstate their
evidence).

**The strongest of the forty uncovered findings**, each verified against the code: the five nightly
Maestro paths of §4.6 do not exist (no `schedule:` in any workflow, Maestro is invoked by none, and
one named path is the drag interaction the system does not have); the nightly training pipeline is
`hourwell-train.timer` on the EU VM while `train.yml` runs the same code on synthetic data only;
лістинг 4.1 logs `skipEvent` where the client logs `lapse_observed` and writes a status the
`tg_guard_recommendation_status` trigger refuses from clients; the "pixel-identical UI" blinding
claim has a hole (the trade-off sheet computes `est_completion_drop` in the learned arm and returns
generic in the heuristic one); the free tier costs an hourly `bench_solve.py` load to hold CPU p95
≥ 20 % against Oracle's reclamation rule; `|C| = 14`, not «12–18»; the `dangerText` token ships and
is missing from Додаток В; and the reference list orphans five sources while eleven arguments cite
none.

**Verification depth: thesis-critical.** Two source sweeps (23 ADRs; seven days of device notes
plus the checklist) and a fresh-context adversarial pass ran as subagents.

## Exact next actions

1. **Owner decides the chapter structure** (§1 of the rollup, last paragraph) — five chapters or
   six. Everything downstream hangs on it.
2. **Write in the order of §14**: the four full-strength statements first, then Розділ 6, then
   Розділ 5, then Розділ 1 §1.4–§1.6, then the Розділ 2–4 edits, then the annotation and
   conclusions, then appendices and the reference list.
3. **Re-count the test suites at freeze time** and paste the gate output — the 583/191 pair in #62
   and the conclusions is traceable to nothing (the last recorded runs are jest 519/521 and
   Deno 187).
4. Two new appendices to generate: the 75-cell sensitivity table (Додаток З) and the frozen
   pre-registration plus world grid (Додаток И).

## What the next phase needs to read

- `docs/thesis/corrections-rollup.md` — §1 (chapter map), §2 (numbers), §3 (the four statements),
  then the chapter section you are writing. **Do not re-read all of `specs/`.**
- `docs/thesis/thesis-corrections.md` only for the reasoning behind an item you are pasting.
- `docs/study/simulation-results.md` and `sensitivity-results.md` when writing Розділ 6 §6.1–§6.5;
  `sensitivity-grid.md` §1 for the world model, which is quoted almost verbatim.
- `docs/thesis/spec-conflicts.md` before implementing anything a spec file describes, and in full
  when writing §6.8.
- The draft itself is git-ignored; extract its text with `python3 -c` over `word/document.xml` if
  you need the current wording.

## Open items for the owner (none block the writing)

- **Four device-checklist rows under "Ukrainian interface"** remain deferred by the owner
  (2026-09-09) — NFR-A2 in Ukrainian at 200 % on both phones, a real Ukrainian IME's apostrophe,
  Ukrainian month/weekday names under Hermes on **Android**, and notification copy after a switch.
- **`docs/verification/uk-a11y-sweep.sh` leaks a Metro bundler**; the fix is `--no-bundler` on the
  `npx expo run:ios` line. Owner's instruction: no PR for one line — fold it into the next phase
  that touches main. Still pending.
- **`device-checklist.md` has two stale spots** the rollup names: the NFR-P1 row runs the 2 Sep and
  3 Sep series together as "the same inbox", and the iOS NFR-A2 Settings-path row reads ⬜ while
  `ios-20260908-1215` item 69 records it as PASS.

---

## Earlier state (localisation, 2026-09-09) — superseded above but still current for its rows

### What the localisation phase established (2026-09-09)

**Shipped (`38543d8`, `f71a3f3`, `f5fff2f` + docs):** a second catalog (465 strings + 13 counted
sentences) with a `Системна / English / Українська` switch in Settings; plural forms as a mechanism
(Ukrainian needs three integer forms, English two); dates bound to the app's language while
regional conventions follow the phone; Ukrainian natural-language quick-add; and an honest hint
when nothing parses, in either language.

**The two findings that changed the brief.**

1. **`chrono.uk` exists.** Two hardware notes recorded "chrono-node is English-only". Measured on
   the pinned 2.10.1, it ships a Ukrainian parser in upstream's full-support tier — the English-only
   property was our configuration. FR-11 is now bilingual; both notes carry dated corrections and
   spec-conflicts L22 records it. Residual gap: «цими вихідними» (chrono returns no parse and the
   whole line stays the title). «за 30 хвилин» was a _defect_ the adversarial pass caught, not a
   gap — it read as a 30-minute estimate; it is now a deadline, like «через 30 хвилин».
2. **No validated Ukrainian rMEQ exists.** The validated Ukrainian chronotype instruments are the
   CSM and MCTQ (Senyk, Jankowski & Cholii, Biological Rhythm Research 53(6):878–896). The five
   items stay English in every catalog, pinned by a test, with the reason on the screen. Owner
   decided this (and the full-parsing option) before implementation.

**Measured (iOS simulator, iPhone 16, Release):** four Maestro flows — onboard, switch, sweep at
accessibility-XXXL, a real plan — all pass. The block action row **wraps** rather than clips
(«Пропустити» is +150 % on `Skip`); FR-21 rationales read as Ukrainian sentences; the _few_ plural
form appears correctly; `Intl` gives «середа, 9 вересня» on iOS. Evidence:
`docs/verification/i18n-uk-20260909/notes.md` + 7 screenshots.

**Corrected in the records, not quietly:** the first draft of ADR-0023, the explainer and one commit
message said a language change returns the user to Today. It does not — expo-router restores the
route, so Settings stays open and re-renders. Fixed where claimed; the older font-scale claim it
reasoned from is untouched because this run did not test it.

**Adversarial pass (fresh-context subagent) → `c272d69`:** seventeen findings, five of them
blocking. Two were real parser defects — «г» read as _hours_ when it is the abbreviation for _gram_
(«купити 100 г кави» became a 6000-minute task the solver could never place), and «за 30 хвилин»
read as a 30-minute estimate instead of a deadline, which four records described as a graceful
fallback. Two were tests that could not fail: the gendered-past-tense tripwire used ASCII `\b`/`\w`
and matched nothing in Cyrillic, and the region-tag case sliced its own input down to `'uk'` —
fixing it exposed `resolveLocale` failing on a device reporting `uk-UA`. The fifth was the
verification directory claiming four passing flows while committing three JUnit files. All fixed;
the remaining twelve are small and logged in `revisit.md` or addressed in place.

**Verification depth: routine**, as the owner scoped it. No hardware was needed and none is claimed.

## Exact next actions

**None of its own.** The phase is merged and nothing is pending. A fresh session picks the next item
with the owner from `docs/decisions/revisit.md`.

**One deferred one-liner to carry:** `docs/verification/uk-a11y-sweep.sh` documents a build step
that leaks a Metro bundler (see "Environment" below). The fix is `--no-bundler` on the
`npx expo run:ios` line plus a word in the header comment. The owner's instruction (2026-09-09) is
**not** to open a PR for one line — **fold it into the next phase that touches main.** Logged in
`revisit.md` so it is not lost.

If a catalog string is ever edited: regenerate the owner's review surface with
`node scripts/i18n-copy-review.mjs && pnpm format` — the prettier pass is not optional, or the
committed doc and a fresh run differ by hundreds of lines of table padding.

## Open items for the owner (none block anything)

- **Four device-checklist rows** under "Ukrainian interface", **deferred by the owner on 2026-09-09
  to a later pass — they will say when they want a build on the Android phone.** No device is
  connected and none was needed for this phase. The rows: NFR-A2 in Ukrainian at 200 % on both
  phones (the English rows do **not** transfer — mean +56 % label growth); a real Ukrainian IME
  (which apostrophe it emits; the parser folds four variants); Ukrainian month/weekday names under
  Hermes on **Android** (iOS is settled — `Intl` gave «середа, 9 вересня» on the simulator);
  notification copy and the Android channel rename after a switch.
- ~~One copy trade worth a listen: «%» vs "percent"~~ — **owner reviewed the copy on 2026-09-09 and
  approved it unchanged, «%» included.** Closed; do not re-raise it.
- **revisit.md gained four lines**: arm A always falls through to the generic trade-off consequence
  (`pinned_overlap_minutes` vs `pinned_conflict` — a small hole in the study's "pixel-identical UI"
  claim); the Ukrainian CSM as a future cold-start instrument; PLAN §2's stale `packages/shared`
  promise; and `e2e/p2-a11y-sweep.yaml` being stale against the current Settings and Insights.

## What the next phase needs to read

- `docs/decisions/ADR-0023-localisation-boundary.md` — the whole decision, including the English
  list written to be quoted.
- `apps/mobile/src/i18n/` — five files: `locale.ts` (which catalog), `plural.ts` (the rules),
  `format.ts` (dates), `en.ts` (reference catalog + `MessageKey`), `uk.ts`.
- `docs/verification/i18n-uk-20260909/notes.md` for what the simulator did and did not settle, and
  its gotchas (Maestro screenshot paths, `accessible` Pressables hiding their child text, the
  simulator keyboard).
- A third language is again "add a file": add it to `CATALOG_LOCALES`, write the catalog, and the
  parity/hygiene/slot tests hold it to English automatically.

## Environment left as found

- **Simulator: shut down** (owner's instruction, 2026-09-09). iPhone 16 (`5C080B83-…`), iOS 18.3,
  still holds the Release build of `bc753eb`, text size `medium`, app in Ukrainian on a throwaway
  anonymous account with one plan. Several throwaway anonymous accounts were created on the hosted
  project across the sweep runs (retention-purge material, like the session-only rows from earlier
  passes), and a handful of plan requests were made. Nothing needs cleaning up; the next session may
  boot it and `clearState` freely.
- **A leftover Metro bundler was killed at the end of the session.** `npx expo run:ios` was invoked
  **without** `--no-bundler`, so after the build installed, Metro kept running and streaming the
  simulator's log for ~2.5 h — it looked like a stalled build from the outside (no build output, a
  log file still growing with app-runtime noise). It was never waiting for a device: the command
  targeted the simulator UDID. See the deferred fix below.
- **This session's Release build added a DerivedData tree** (`~/Library/Developer/Xcode/DerivedData/
Hourwell-blsssfravpwaygfiszsljufasxeb`) — relevant to the standing disk-space item below.
- **Phones:** untouched this session; the owner has since unplugged both. Pixel 7a and iPhone 12
  remain as the motion phase left them.

---

## Earlier state (motion phase, 2026-09-08 → 09) — superseded above but still current for its rows

**post-p12/motion is merged** (PR #60, plus PR #61 with the owner's-eyes judgement). File 02 §3.4 is
closed on the plan surface (spec-conflicts L42), ADR-0022 accepted with hardware results from both
phones. S1 — after Done / Skip / I did it the rows settle on a cell `layout` spring registered for a
350 ms window; S2 — a moved block travels, or the list scrolls to it and the arrived card plays a
transform-only settle once.

**Measured:** Pixel 7a, the same 13-block plan under a build of main and the motion build — NFR-P2
equal (1825 / 1824 frames, 1 janky, p99 10 ms); Done 11 frames, Skip 10, I did it 14, on-screen move
12, off-screen move = a 17–19-frame scroll then a 7-frame arrival settle; one frame per interaction
under reduced motion **on `transition_animation_scale 0`**. iPhone 12, a 16-block plan — NFR-P2 8 = 8
hitches (847 / 807 frames); Reduce Motion via the daemon hold verified by a second client. Evidence:
`docs/verification/device-pass/android-20260908-motion/notes.md`,
`ios-20260909-motion/notes.md`.

**Open owner items from that phase:** Auto-Lock back to the usual value on the iPhone; the Mac's disk
(22 GB free; `~/Library/Developer/Xcode/iOS DeviceSupport` 14 GB, Xcode caches, simulators are the
big items — note this session's Release build added a DerivedData tree); optionally an iOS build
with `ac99dea` if the arrival settle should be seen on the iPhone.

**Tools left in `docs/verification/`:** `hw-motion-frames.py`, `hw-motion-drive.py`,
`hw-scroll-frames.sh`, `hw-set-profile-timezone.mjs`, `hw-ios-hitches.sh`, `hw-ios-paint.py`,
`hw-ios-motion-drive.py`, `hw-ios-wda.py`, and now `uk-a11y-sweep.sh`. Gotchas are at the end of each
notes file — the two that bit hardest before: never pass driver steps through a double-quoted shell
string, and delete `$TMPDIR/instruments*.ktrace` after every xctrace run.

## ⛔ ACTION REQUIRED (owner — ordered; one per turn)

1–5. ✅ (migration, role, DPIA, store decision, Android hardware pass). 6. Hardware-pass
prerequisites only (Google OAuth Web client, mailbox) — for the device-checklist auth/calendar rows
and the two-device sync row. 7. ~~Pre-enrollment list~~, ~~OSF freeze~~ retired. 8. iPhone pass —
done (2026-09-07/08).

## Standing gotchas (earlier lists in this file's git history still apply)

- **Auto-merge:** arm it once right after `gh pr create`; never re-run `gh pr merge` after a push.
  `enforce_admins` is on, so a premature merge is refused.
- **The iOS simulator and the phones share the hosted project.** A "newest auth user" read is
  ambiguous while both run.
- **RN Modal presents from its nearest view controller** — a new native modal screen needs its own
  `DialogHost`.
- **Maestro on the simulator cannot dismiss the keyboard** (`hideKeyboard` fails) and cannot walk
  the P4 onboarding at accessibility sizes; a relaunch is the reliable way past a stuck keyboard.
- **expo-doctor 20/21:** TypeScript ~6.0.3 expected vs 5.9.3 pinned (ADR-0004) — pre-existing.
- **Prettier pads markdown table cells** — scripted edits anchor on cell content, then `pnpm format`.
