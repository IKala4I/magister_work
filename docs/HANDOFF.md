# HANDOFF — current state for a zero-context session

> Refresh at every phase boundary (and on mid-phase context pressure). Resume line:
> **"Read CLAUDE.md, PLAN.md and docs/HANDOFF.md, then continue."**
> Last update: 2026-09-09 (afternoon) — **post-p12/i18n-uk is complete on the branch**: Ukrainian
> localisation with a language switch, the English boundary decided and stated in the app
> (ADR-0023), FR-11 parsing both languages. Gates green, simulator sweep passed, adversarial pass
> run. The PR is the next action.

## What the localisation phase established (2026-09-09)

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

1. **Open the PR** `post-p12/i18n-uk` → main, title `Post-P12 — Ukrainian localisation`, body =
   requirement ids + pasted gate output; arm auto-merge **once** right after `gh pr create` and
   never re-run `gh pr merge`.
2. **The copy is the owner's review surface, not the diff:** point them at
   `docs/i18n/uk-copy-review.md` (generated, grouped by screen, with a section naming where the
   Ukrainian deliberately is not the literal English). Regenerate with
   `node scripts/i18n-copy-review.mjs` after any catalog edit.
3. Nothing else is pending on this branch.

## Open items for the owner (none block anything)

- **Four device-checklist rows** under "Ukrainian interface": NFR-A2 in Ukrainian at 200 % on both
  phones (the English rows do **not** transfer — mean +56 % label growth); a real Ukrainian IME
  (which apostrophe it emits; the parser folds four variants); Ukrainian month/weekday names under
  Hermes on **Android**; notification copy and the Android channel rename after a switch.
- **One copy trade worth a listen:** Ukrainian writes «%» where English spells out "percent" for
  screen readers. Correct convention and TTS reads it, but it is the one place the trade could cost
  a screen-reader user.
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

- **Simulator:** iPhone 16 (`5C080B83-…`), iOS 18.3, Release build of this branch installed, text
  size restored to `medium`, app in English on a fresh anonymous account. Two throwaway anonymous
  accounts were created on the hosted project during the sweeps (retention-purge material, like the
  session-only rows from earlier passes); one plan request was made.
- **Phones:** untouched this session. Pixel 7a and iPhone 12 remain as the motion phase left them.

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
