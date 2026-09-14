# Naming — Kairos → Hourwell

The specification set in `specs/` (read-only) uses the internal codename **Kairos**.
The public product name is **Hourwell** — subtitle: _"The planner that learns your best hours."_

| Context                                                | Name                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| `specs/` documents, requirement IDs                    | Kairos (unchanged, read-only)                                    |
| Thesis text (`docs/thesis/`)                           | **Hourwell** (renamed 2026-09-11, see below)                     |
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

**Thesis rename (2026-09-11).** The thesis text now carries the public name. `draft.docx` still
says Kairos and is never edited in place, so the substitution is a global sweep at the end of
`docs/thesis/assemble.py` — after every anchored edit, because two `ROLLUP_EDITS` markers and the
«висновки п.5» locator match draft prose that still contains «Kairos». It covers headings, table
cells and text-file chapters, not only paragraphs: 14 blocks. `specs/` keeps the codename — it is
design history, not a claim about the product.
