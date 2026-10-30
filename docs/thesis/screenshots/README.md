# Screenshots for рис. 3.4 and the poster

```bash
docs/thesis/screenshots/make.sh <simulator-udid> /Users/vladyslav/Workspace/MagisterDocs
```

One command: Ukrainian locale and light theme on the simulator, a Release build in the
screenshot-fixture mode, a clean status bar (09:41, full battery and signal, no carrier), four
Maestro flows (`apps/mobile/e2e/screenshots/`) and a full-resolution `simctl` screenshot after each.
Results go outside the repo:

| file in MagisterDocs                                    | used in                    |
| ------------------------------------------------------- | -------------------------- |
| `figures/3.4/1-today.png` … `4-quick-add.png`           | рис. 3.4 (four in one row) |
| `poster/screens/today.png`, `focus.png`, `insights.png` | the poster                 |
| `build/screenshots/`                                    | raw shots, build/flow logs |

Made on the iPhone 17 Pro Max simulator (1320 × 2868 px, iOS 26.5), 2026-10-30.

## What is on the screens

**An invented person, not data.** The fixture build (`EXPO_PUBLIC_SCREENSHOT_FIXTURE=1`,
`apps/mobile/src/fixture/`) runs local-only — `EXPO_NO_DOTENV=1`, so no Supabase, Sentry or PostHog
key is in the bundle and nothing leaves the simulator — and seeds one demo day on a clean install:

- a moderately morning chronotype with the default working hours, four weeks in;
- Friday's plan: a finished block, deep work in a running focus session, one experiment block, the
  afternoon ahead; rationales are keys from the app's closed vocabulary, so the sentences are the
  app's own catalog;
- four tasks in the Inbox; Ukrainian titles, no names, no calendar;
- the app's clock starts at 09:41 so the "Now" marker and the timer agree with the status bar;
- the Insights document comes from the service's own `insights()` builder over v0 priors plus four
  weeks of invented outcomes (`services/recsys/scripts/screenshot_insights.py`); only the 8-week
  adherence trend is hand-set.

The figure illustrates the interface. Its caption says so and claims nothing about the numbers.

Simulator only: nothing here is device evidence (CLAUDE.md, "Simulator evidence").
