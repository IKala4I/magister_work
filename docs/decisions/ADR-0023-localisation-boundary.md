# ADR-0023 — Ukrainian localisation, and the boundary the app does not cross

- **Date:** 2026-09-09
- **Status:** accepted
- **Phase:** post-P12
- **Spec anchors:** PLAN.md decision 6 (English strings + i18n scaffolding from P2; "Ukrainian =
  add-a-file later"); FR-01, FR-02, FR-11, UC-01, UC-02, NFR-A1, NFR-A2; File 04 §3.1 (rMEQ →
  class); ADR-0005 §3 (rMEQ presentation licence); spec-conflicts L7, L13, L14, L15
- **Decision rule applied:** thesis defensibility first (the instrument), then internal
  consistency (the closed client↔server vocabulary), then measurability, then pragmatics.

## Context

The app has shipped English since P2 with the scaffolding decision 6 asked for: `t()` over a typed
catalog and a lint rule against raw JSX text. Adding Ukrainian is the "add a file" that decision
anticipated — but a second catalog is the small part. The questions that needed deciding are what
does **not** get translated, why, and how a Ukrainian-speaking reader learns that the boundary is a
decision rather than unfinished work.

Three findings shaped it, and two of them contradict what the repo previously recorded.

1. **`chrono.uk` exists.** `docs/verification/device-pass/android-20260901-2030/notes.md` item 9 and
   `android-20260902-1030/notes.md` item 6 both say "chrono-node is English-only". Measured on the
   pinned 2.10.1: `chrono.uk` is present and in upstream's _full support_ tier. The statement is
   wrong about the library and right about our configuration — `chrono.parse` is the English casual
   parser, and the duration/connector grammar beside it was ours and English. Corrected in place as
   dated notes; spec-conflicts L14.
2. **No validated Ukrainian rMEQ exists.** The validated Ukrainian chronotype instruments are the
   CSM and the MCTQ (Senyk, Jankowski & Cholii, _Ukrainian versions of the Composite Scale of
   Morningness and Munich Chronotype Questionnaire_, Biological Rhythm Research 53(6):878–896,
   DOI 10.1080/09291016.2020.1788807), whose abstract states there were no instruments to measure
   chronotype in Ukrainians before that work.
3. **The expansion figure that matters is not the usual one.** Ukrainian prose runs 20–30% longer
   than English; the short action labels that live in fixed-width rows run far longer —
   `Skip`→«Пропустити» +150%, `Undo`→«Скасувати» +125%, `Move`→«Перенести» +125%, mean +56% over a
   16-label risk set. The NFR-A2 rows closed on both phones were closed in English.

## Decisions

### 1. What stays in English, and why

This list is the deliverable, not a side effect. One line each.

1. **The chronotype survey — its five items and their answer options.** The published cut-offs that
   turn a score into a class (22/18/12/8 on a 4–25 scale, File 04 §3.1) were established against
   particular wording; no Ukrainian validation of this instrument exists, so a translation we made
   ourselves would produce a number the literature's class boundaries no longer describe. Every
   national version — Spanish, German, Polish, Arabic, Japanese — is its own validation study, and
   the French validation found the cut-offs shift with the population. ADR-0005 §3 licences light
   paraphrase _within_ the language of validation, which is a different act from crossing into
   another one.
2. **Natural-language quick-add — its residual limits, not the feature.** The feature is bilingual
   as of this decision. What stays English is the vocabulary the parser was never taught:
   «цими вихідними» and free-form case endings fall back to the plain title, exactly as an
   unrecognised English phrase does. (This line first also named «за 30 хвилин»; the adversarial
   pass showed that was not a graceful fallback but a defect — the duration grammar masked it and
   read a deadline as a 30-minute estimate, leaving a dangling «за» in the title. «за» is now a
   deadline connector and the case is tested.)
3. **Everything crossing the client↔server boundary.** Rationale keys, trade-off consequence
   metrics, unplaced reasons, degradation levels, engine tags, context buckets,
   category/daypart/day-type enums, analytics event names, model version strings, database enum
   values. These are machine identifiers, not prose: they are versioned, tested, replayed by the
   off-policy evaluation and reproduced in the thesis tables, and translating them would break
   every one of those.
4. **What the user wrote.** Task titles and imported calendar event titles are the user's own words
   in whatever language they chose; the app renders them and never touches them.
5. **The Google Calendar write-back prefix (`Hourwell · <title>`).** A brand name joined to the
   user's own title, composed server-side where no user language is available — the only place in
   the system where a server concatenates a literal into text a person reads.
6. **The data export (FR-42).** An interchange document whose field names are an API contract, not
   reading matter; a translated key would make an export unreadable by whatever consumes it.
7. **Diagnostics.** Log lines, error codes on the wire, outbox failure details. They address
   whoever debugs the system; the user sees the app's own sentence instead.

**The cost, recorded rather than hidden.** Item 1 costs a Ukrainian-only speaker the survey. It is
paid for by the skip path, which is a designed route and not a failure (any blank answer ⇒ INT with
prior strength halved, ADR-0005 §2), and by saying so where the survey is shown.

### 2. The app says where the boundary is

Three places, none of which apologises: name what is English, give the reason in one clause, give
the way out.

- **Settings → Мова** carries a "Що лишається англійською" block — the survey, the user's own
  words, the technical records. It renders only when the interface is not English, where it would
  otherwise explain nothing.
- **The survey screen** carries the reason above the five items, in Ukrainian, including that
  skipping is fine.
- **Quick add** says when nothing parsed, in either language. Until now that state was silent: no
  chips, no reason — which is what the owner met on the phone on 2026-09-01 typing Ukrainian.

### 3. The switch

`Системна / English / Українська` in Settings, built on the Appearance radiogroup it sits beside.
`Системна` is the default, so a Ukrainian phone gets a Ukrainian app untouched; an explicit choice
outranks the device in both directions. The choice persists as an MMKV flag and is read by
`src/i18n/locale.ts` directly, so the first string of a cold start is already right.

**A change remounts the tree.** `t()` is a plain function read by 378 call sites, none of them a
hook, so nothing would re-render on its own. The language joins the font-scale key already on the
root `Stack` — the mechanism that is device-verified for exactly this problem.

_Measured on the simulator 2026-09-09, correcting this ADR's first draft:_ the remount does **not**
throw the user out to Today. expo-router restores the route it was on, so the Settings modal stays
open and re-renders in Ukrainian, scrolled back to the top. This paragraph originally claimed the
opposite by analogy with the font-scale comment in `app/_layout.tsx`; the analogy was never
measured for this key. Evidence: `docs/verification/i18n-uk-20260909/` item "One correction".

**A change carries three other things with it:** `profiles.locale` (a column that has existed since
P1 and was written `'en'` unconditionally — untrue the moment a second catalog exists), the
notification categories and Android channel names, and any pending notification bodies, which are
rendered at schedule time. Renaming an Android channel is safe: after creation the OS permits
changing exactly its name and description (expo-notifications documentation, verified 2026-09-09).

### 4. Dates follow the language, conventions follow the phone

Every date was `toLocale*(undefined, …)` — ask the OS. Correct only while device and app agree;
with a switch, a Ukrainian interface on an English phone would print "Wed, 9 Sep" under Ukrainian
prose. The tag is now built as **language from the catalog, regional conventions from the phone**:
the device's own `languageTag` when its language matches the active catalog, else `uk-UA`, else
`en-GB`. `en-GB` rather than `en-US` because the app writes its own times in 24-hour form, and a
phone that never asked for a 12-hour clock should not get one.

### 5. Plurals are a mechanism, not a ternary

Ukrainian has three integer forms where English has two. Thirteen counted sentences that chose
between two keys with `count === 1` became plural families resolved by the locale's rule.
Hand-written CLDR rules, deliberately **not** `Intl.PluralRules`: Hermes builds its own ICU subset
per platform, and which sentence a person reads must not depend on that.

### 6. The Ukrainian catalog is written, not transposed

Two rules, in the catalog header and enforced where they can be:

- **Interpolated slots stay nominative.** The app has no case system, so sentences are restructured
  rather than given one. Dayparts are adverbs (`вранці`, `по обіді`) precisely because an adverb
  needs no agreement; `beliefs.dayType.*` is capitalised because it is always sentence-initial.
- **No first-person past tense.** It is gendered in Ukrainian and the app does not know the reader's
  gender, so "I did it" is «Уже зроблено». A test is the tripwire.

Percentages are written `%` rather than spelled out, which is both the Ukrainian convention and
shorter on the screens where the English spells "percent" for screen readers.

### 7. Deliberately not done: OS per-app language

The expo-localization plugin's `supportedLocales` would add a language picker to system settings.
Two switches that can disagree is the rough edge this work exists to remove, so it stays off.

## Consequences

- **NFR-A2 does not transfer.** The rows closed on the Pixel 7a and the iPhone 12 were closed in
  English. Four device-checklist rows are added rather than any claim being made: Ukrainian at 200%
  on both phones, a real Ukrainian IME (which apostrophe it emits — the code folds all of them),
  Ukrainian month and weekday names under Hermes on Android, and notification copy plus the Android
  channel rename after a switch.
- **A recorded limitation is retired, not explained.** FR-11 works in both languages; the thesis
  text that inherited "chrono-node is English-only" changes (thesis-corrections #63).
- **The instrument becomes a stated decision in the thesis**, with a citation for why translating it
  was refused and a named cost. It also opens a future option — adopting the Ukrainian CSM — whose
  price is a new score→class→prior derivation; logged in revisit.md, not taken.
- **Copy is reviewable as copy.** `docs/i18n/uk-copy-review.md` is generated from the catalogs,
  grouped by screen, so the owner reads Ukrainian a screen at a time instead of out of a diff.
- **Every catalog is held to the English one** by parity, hygiene and slot tests, so a third
  language is again "add a file" — and a missing or malformed string fails CI rather than shipping.
