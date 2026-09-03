# Hardware pass — Android — Pixel 7a — day 3 (2026-09-03), running notes

Build on the phone: **build 3** (`ee920100ba66…`, main 3f1159d) — unchanged today; the service
and the `plan-request` function change under it (PR #39, ADR-0018). Phone rule as on day 2: the
phone is the session's while a step runs; the owner is told before each block whether to be at
the phone. Times are UTC unless marked EEST (UTC+3).

## Established today (chronological)

1. **NFR-P1 from the device — the client side of the day-2 series** (owner's PostHog export,
   `posthog-plan_requested-2026-09-02.csv`, 19 `plan_requested` rows; `trigger`, `outcome`,
   `engine`, `model_version`, `duration_ms` all present). What the client timer measures
   (`apps/mobile/src/sync/planRequest.ts`): `syncBeforePlan()` — a sync-resolve push + pull that
   runs whenever ops are pending or the last sync is > 30 s old — then the `plan-request`
   invoke; it stops **before** the SQLite mirror. Each row paired with its server row by
   `plans.generated_at` (= the function's `t0`) → `nfr-p1-2026-09-02-client-decomposition.json`
   (17 of 19 paired exactly; the two `first_open` rows at 08:49:04 and 13:16:09 have a function
   start earlier than the computed client start because the PostHog timestamp is taken after the
   mirror — the head/tail split carries that ± 0.2–0.4 s, the sum head + tail = duration −
   function is exact).

   | client start (UTC) | trigger        | outcome  | duration ms | head ms | function ms | tail ms | solve ms | status    |
   | ------------------ | -------------- | -------- | ----------- | ------- | ----------- | ------- | -------- | --------- |
   | 08:37:34           | first_open     | learned  | 3519        | 723     | 1806        | 990     | 1002     | FEASIBLE  |
   | 08:38:45           | manual         | learned  | 1571        | 102     | 999         | 470     | 325      | OPTIMAL   |
   | 08:38:53           | manual         | learned  | 3499        | 1285    | 1637        | 577     | 1001     | FEASIBLE  |
   | 08:39:01           | manual         | learned  | 3429        | 1387    | 1618        | 424     | 1007     | FEASIBLE  |
   | 08:39:09           | manual         | learned  | 3667        | 1457    | 1719        | 491     | 1001     | FEASIBLE  |
   | 08:39:17           | manual         | fallback | 3271        | 994     | 1908        | 369     | —        | HEURISTIC |
   | 08:39:25           | manual         | learned  | 2692        | 1416    | 724         | 552     | 7        | OPTIMAL   |
   | 08:39:34           | manual         | learned  | 2919        | 616     | 1662        | 641     | 1005     | FEASIBLE  |
   | 08:39:42           | manual         | learned  | 3836        | 1622    | 1739        | 475     | 1002     | FEASIBLE  |
   | 08:39:50           | manual         | learned  | 3526        | 1325    | 1687        | 514     | 1002     | FEASIBLE  |
   | 08:39:58           | manual         | learned  | 3107        | 843     | 1670        | 594     | 1004     | FEASIBLE  |
   | 08:49:04           | first_open     | learned  | 2331        | ≈ 0     | 1794        | ≈ 540   | 1002     | FEASIBLE  |
   | 08:49:43           | first_open     | learned  | 2084        | 246     | 1533        | 305     | 940      | OPTIMAL   |
   | 08:50:34           | first_open     | learned  | 3498        | 1140    | 1707        | 651     | 1002     | FEASIBLE  |
   | 08:54:13           | first_open     | learned  | 2536        | 382     | 1727        | 427     | 1002     | FEASIBLE  |
   | 11:42:36           | first_open     | learned  | 4857        | 2577    | 1393        | 887     | 59       | OPTIMAL   |
   | 13:13:47           | first_open     | learned  | 3992        | 1869    | 1019        | 1104    | 11       | OPTIMAL   |
   | 13:16:09           | first_open     | learned  | 1533        | ≈ 0     | 774         | ≈ 760   | 13       | OPTIMAL   |
   | 17:22:42           | evening_ritual | fallback | 2747        | 110     | 1909        | 728     | —        | HEURISTIC |

   **Manual series (warm; 14-task inbox on a 12:00–18:00 window, 8 s apart):** duration
   **p50 3271 / p95 3836 ms** (min 1571); function p50 1662 / p95 1908; client overhead
   (duration − function) p50 ≈ 1.6 s = a pre-plan **sync push of 1.0–1.5 s** whenever ops were
   pending (each re-plan mirrors the plan and sends the unplaced tasks back to the Inbox through
   the outbox, so the next re-plan pushes 4–16 ops — `sync_ops.applied_at` lands 0.9–1.3 s
   before each function start; the one request with nothing pending had a 102 ms head) plus
   **≈ 0.4–0.6 s** of transport + response handling + mirror. All 19 rows: p95 4857 ms — a
   cold-start `first_open` whose head (2.6 s) is the app's startup sync.
   **Against the spec's "≤ 2.5 s p95 warm from the device": not met** — server-side the series
   looked inside budget (1.9 s p95) because a third of what the user waits for happens before
   the function is even called. Owner (mid-turn today): the 2.5 s was a pre-deployment guess;
   the thesis states the figure arrived at by measurement — see "NFR-P1 as a measured
   requirement" below once the after-rollout numbers are in.

2. **First open on the 3rd adds NO plan request** — warm foreground 07:33:46 (LaunchState WARM,
   770 ms) and a cold start 07:35:25 (COLD, TotalTime 549 ms): today's plan (the ritual plan of
   the 2nd, 10 blocks) was found, 0 rows added, 24-h count unchanged at 19. UC-03 dedup holds
   across the day boundary for the "plan exists" case; the `new_day` / no-plan case is the 4th
   (nobody taps tonight's ritual — owner directive). The lazy lapse scan ran on the foreground:
   the 09:00 block reads "Not done — back in your Inbox / I did it".
3. **"Before" series, 07:37:01–07:38:14 (10 adb taps on Re-plan, 8 s apart; window from now to
   18:00, 15-task inbox):** 1/10 `fallback:timeout` (1907 ms), 9/9 learned **FEASIBLE at the
   1.0 s slice** (solve 1001–1007 ms), function total 1449–1757 ms →
   `series-before-2026-09-03.json`. Same shape as day 2. 24-h count → 29 of 30.
4. **The stall reproduced from the device's own data** (`stall-instance-inputs.json`,
   `probe-stall-*.py`): 15 `admin` tasks of value 2, ten × 30 min + five × 45 min, two
   deadlines, the real prior cells, 8 previous assignments, `now` = 11:38 local. 24/24 solves
   FEASIBLE at the 1.0 s slice; first solution at 10 ms, last improvement p50 0.054 / p90 0.206 /
   max 0.298 s; relative bound gap **0.38–1.21** — an optimality-proof stall of the LP bound on
   interchangeable tasks. `symmetry_level=2`, `+probing 1`, `relative_gap_limit=0.05`: 12/12
   still at the cap. No-improvement window 0.2 / 0.3 s: 228–509 / 323–610 ms with the **same
   objective on 12/12**. Loss curve (24 trajectories) and the box/Mac ratio (2.5–4×; the
   sweep's clean 12/14-task instances: 61–62 / 277–285 ms on the box vs 15–32 / 22–98 ms here)
   → **ADR-0018**: `relative_gap_limit = 0.01` + a 0.3 s no-improvement early stop (≥ p95 of
   the box-scaled inter-improvement interval; ≤ 0.3 % measured loss) + trajectory telemetry on
   every plan + concurrent count/context reads in the function. **PR #39.** The owner's named
   lever (the gap limit) alone would have changed nothing on this class — measured and reported.

5. **PR #39 merged 10:58 EEST** (auto-merge fired once the fast checks were green — the three
   slower checks finished green on `main` afterwards: CI 11:00, synthetic training pipeline
   11:05, RecSys image → rollout 11:06; the training image also rebuilt, 11:00). `plan-request`
   **v12** deployed 11:06 (smoke: 3 throwaway requests, none fell back); the box served build
   `813cdbade0e9` from **11:05:58** (uptime 4 s at the first health read).
6. **Sweep re-run on the new build — 0 / 36 fallbacks (before 1 / 36), 0 / 9 on the splittable +
   deadlines variant** (`plan-budget-sweep-after.json`, `…-after-splittable.json`; comparison
   table in ADR-0018's last section). The 20-task full day now ends by the no-improvement window
   at 743–770 ms (was 865–1002 ms at the cap); 16 tasks 206–281 ms OPTIMAL (was 367 ms or a
   timeout); function work outside the service call p50 388 / p90 517 ms (was 553 / 797) — the
   concurrent count/context reads. **Method note:** the sweep's plan dates were hard-coded to
   2026-09-03/04/05, so the first re-run today planned a 6.75 h "full" window
   (`plan-budget-sweep-after-todays-window.json`, kept as a labelled data point); the script now
   rolls its dates from today, and the like-for-like run uses Fri 09-04 (9 h) / Sat 09-05 /
   Sun 09-06 — weekend cells on the two shorter horizons, which are OPTIMAL in ≤ 0.23 s either way.
7. **First device after-point (11:06:34, same inbox):** solve 421 ms, `early_stop = true`,
   16 improving solutions, last improvement at 112 ms, longest wait 23 ms, bound gap 1.13;
   service 942 ms, function 1142 ms. The full after-series follows once the 24-h plan limit
   (30) frees up at 11:37 (the "before" series and yesterday's rows fill it).

8. **"After" series (11:40:33–11:41:46 EEST, 10 adb taps 8 s apart, same inbox, window now →
   18:00):** **0 / 10 fallbacks** (before 1 / 10); function total **p50 1091 / p95 1342 ms** (before
   1675 / 1907); solve p50 400 / p90 632 / max 665 ms, `early_stop` 10 / 10, last improvement
   49–356 ms, longest wait between improvements 13–268 ms, bound gap 1.21–2.23 →
   `series-after-2026-09-03.json`; comparison table + the window re-pin note in ADR-0018's last
   section. 24-h count → 29 of 30 again (the limiter, as designed).
9. **Box trajectory on clean instances** (`plan-budget-sweep-after-trajectory.json`, 14 and 20
   tasks on 9 h / 4.5 h / 2 h): numbers below the line in the file; used for the re-pin rule.

## Results by build

| Build | Source / APK                                                        | Numbers and checks attributed to it                                                                                                                |
| ----- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3** | main 3f1159d source, `ee920100ba66…`, installed 2026-09-02 17:00:04 | day 3: first-open no-request (warm + cold), before-series; everything below the line after the ADR-0018 rollout is the same APK on the new service |

## Evidence files

- `posthog-plan_requested-2026-09-02.csv` — the owner's export (19 rows; pseudonymous ids).
- `nfr-p1-2026-09-02-server.json` — the 19 server rows with ms timestamps and telemetry.
- `nfr-p1-2026-09-02-client-decomposition.json` — client ↔ server pairing (head / function / tail).
- `series-before-2026-09-03.json` — the 10-row "before" series.
- `stall-instance-inputs.json`, `probe-stall-reproduce.py`, `probe-stall-configs.py`,
  `probe-stall-loss-curve.py`, `probe-box-ratio.py` — the reproduction behind ADR-0018.
