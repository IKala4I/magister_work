# Naming — Kairos → Hourwell

The specification set in `specs/` (read-only) uses the internal codename **Kairos**.
The public product name is **Hourwell** — subtitle: _"The planner that learns your best hours."_

| Context                                                | Name                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `specs/` documents, requirement IDs, thesis text       | Kairos (unchanged, read-only)                                    |
| App name (app.json / Expo config, store listings)      | Hourwell                                                         |
| Bundle / application id                                | `com.hourwell.app`                                               |
| UI strings, notifications, onboarding copy             | Hourwell                                                         |
| README, runbook, store metadata                        | Hourwell                                                         |
| Service names, Docker labels (RecSys Space, workflows) | hourwell-*                                                       |
| Repo-internal code identifiers                         | neutral (no codename needed); user-facing constants say Hourwell |

Spec phrases like "What Kairos believes about you" (FR-41) render in the UI as
"What **Hourwell** believes about you".

**Name diligence (2026-08-24):** web search found no existing "Hourwell" product; nearest names
(Hourly, Hourful, HoursTracker) are distinct products. No blocker identified before P0.
A formal trademark + App Store / Play Store name-availability check is scheduled in P12
before store submission.
