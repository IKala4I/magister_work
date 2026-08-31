# Store metadata — Hourwell (P12)

> Listing copy and store-console answers, ready to paste once the developer accounts exist
> (⛔ owner gates). Naming per `docs/naming.md`; character limits verified 2026-08-31
> (Apple: name 30, subtitle 30, keywords 100, description 4000, promo text 170; Play:
> title 30, short description 80, full description 4000). App records should be created
> early — store names are claimed first come, first served (`name-search.md` §2).

## 1. Identity

| Field                  | Value                                                                        | Limit                        |
| ---------------------- | ---------------------------------------------------------------------------- | ---------------------------- |
| App name (both stores) | `Hourwell`                                                                   | 30 ✔ (8)                     |
| iOS subtitle           | `The planner that learns you`                                                | 30 ✔ (27)                    |
| Play short description | `The planner that learns your best hours — and builds each day around them.` | 80 ✔ (74)                    |
| Bundle id / package    | `com.hourwell.app`                                                           | fixed in `app.json` since P2 |
| Category               | Productivity                                                                 | both stores                  |
| Age rating             | 4+ / Everyone (no objectionable content)                                     | questionnaire                |
| Price                  | Free, no in-app purchases                                                    | —                            |

The full tagline "The planner that learns your best hours" exceeds Apple's 30-char subtitle
field — it is the Play short description and the first line of both long descriptions;
the iOS subtitle is the 27-char cut above.

## 2. iOS keywords (≤ 100 chars, comma-separated, no spaces needed)

```
planner,day planner,schedule,time blocking,focus,energy,routine,tasks,adaptive,calendar
```

(87 chars. The description is not indexed on iOS — keywords, name and subtitle are.)

## 3. Long description (both stores; Play indexes it)

```
The planner that learns your best hours.

Hourwell watches when you actually complete things — not when you planned to — and builds
each day around the real you. Every placement comes with a one-sentence reason. Every skip
is a data point, not a failure.

BELIEVABLE PLANS
Your tasks are placed where you are most likely to complete them, around your fixed
meetings. Connect Google Calendar (optional) and Hourwell plans around your events.

ZERO-GUILT ADAPTATION
Skipped a block? It goes back to your inbox and tomorrow's plan adapts. No streaks, no red
marks, no shame. Undo anything destructive within six seconds.

LEGIBLE INTELLIGENCE
Every recommendation carries a "because…". See what Hourwell believes about your energy by
hour of day — and correct it with one tap when it's wrong. Blocks the app is less sure
about literally look less solid.

WORKS THE WAY LIFE WORKS
• Add tasks in plain language ("report 2h by fri")
• Focus timer with gentle session ratings
• Offline-first: view and edit everything without a connection; sync catches up
• Evening ritual: plan tomorrow in one tap
• At most 5 notifications a day — a hard cap, not a promise

PRIVATE BY DESIGN
Your data stays in EU data centers. Learning across users only ever sees broad task
categories — never the text of your tasks or calendar. Export or permanently delete
everything from Settings at any time. No ads, no trackers.

Hourwell is a research project: the recommendation engine is the subject of a Master's
thesis. Study participation is separate, opt-in and consented — using the app never enrolls
you in anything.
```

(≈ 1 600 chars ✔.)

## 4. Data-safety / privacy-nutrition answers (both consoles)

Source of truth: `docs/privacy/dpia.md` §2.3; answers below are the console vocabulary.

| Console item                        | Answer                                                                                                                                                                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data collected & linked to identity | Contact info: e-mail (account; optional — anonymous accounts exist). User content: tasks, optional calendar events (app functionality). App activity: in-app actions (app functionality, analytics — opt-out). Diagnostics: crash logs (app functionality). |
| Data used for tracking (Apple ATT)  | **None.** No third-party ad/tracking SDKs; no cross-app identifiers. No ATT prompt.                                                                                                                                                                         |
| Data shared with third parties      | None sold or shared for advertising. Processors only (Supabase, Oracle Cloud, PostHog EU, Sentry EU — under DPA, listed in the privacy policy).                                                                                                             |
| Encryption in transit               | Yes (TLS 1.3).                                                                                                                                                                                                                                              |
| Deletion mechanism                  | Yes, in-app: Settings → Delete account (synchronous, audited); export also in-app.                                                                                                                                                                          |
| Play "Data deletion" URL            | the privacy policy URL (§5), which documents the in-app path                                                                                                                                                                                                |

Apple export-compliance question: standard HTTPS/TLS only → exempt (answer "standard
encryption", no documentation upload needed).

## 5. URLs (owner: host before submission)

| Field                               | Value                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Privacy policy URL (required, both) | host `docs/store/privacy-policy.md` (GitHub Pages of this repo, or the university page) — ⛔ owner |
| Support URL (Apple, required)       | the repo's GitHub issues page, or a `mailto:` contact — ⛔ owner                                   |
| Marketing URL (optional)            | —                                                                                                  |

## 6. Visual assets (capture at submission time, after the hardware pass)

- iOS screenshots: 6.9" (1320×2868) + 6.5" (1284×2778) sets, 3–5 each; Play: ≥ 2 phone
  screenshots (1080×1920+), feature graphic 1024×500, hi-res icon 512×512.
- Capture list (light + dark): Today with a planned day incl. one "Experiment" block and a
  rationale line · Insights energy heatmap · Focus timer running · quick-add with the parse
  chips · Settings → My data (export/delete — the privacy story).
- The adaptive icon set already ships in `apps/mobile/assets/` (P2).

## 7. Distribution & store economics (⛔ owner decision — re-raised from PLAN §5 row 4)

Facts, 2026-08-31:

| Channel                         | Cost             | What it enables                                                                                                                |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Google Play Console             | **$25 one-time** | Play listing + **internal/closed testing tracks** (up to 100 testers; participant installs without sideloading)                |
| Direct Android APK/AAB sideload | $0               | Study installs without any store; no Play services requirements for our stack; participants must enable "install unknown apps" |
| Apple Developer Program         | **$99/year**     | TestFlight (the only realistic 8-week study channel on iOS) + App Store listing                                                |
| Apple free account              | $0               | Dev builds on ≤ 3 registered devices, 7-day expiry — **unusable for the study**                                                |

Consequence for the study: **iOS participants require the $99/yr membership** (TestFlight);
Android participants cost $0 (sideload) or $25 once (Play internal testing, nicer install
UX). An Android-only cohort is the $0–25 path but abandons the iOS-first polish and shrinks
recruitment. Under invariant 11 (free tier, cost needs approval) this is the owner's call —
recommendation: **$25 Play now** (one-time, unblocks clean Android installs and the listing),
**$99 Apple only when/if iOS participants are actually recruited**.

## 8. Release configuration state (P12)

- `apps/mobile/eas.json`: development / preview / production profiles (remote version
  source, autoIncrement on production). ⛔ owner: `eas login`, `eas init` (writes
  `extra.eas.projectId` into app.json), `eas credentials`, and EAS env vars/secrets for
  `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` before the first
  `eas build --profile production`.
- Store submission itself (`eas submit`) is gated on the developer accounts (§7).
