# Revisit — non-blocking findings against settled decisions

One line each, appended when concrete evidence (a bug, a spec contradiction, a measurement that
doesn't hold) casts doubt on a decided question but does not block the current phase. Batched for
owner review; surfaced in the phase report that adds them. Blocking findings never land here —
they stop the phase. (CLAUDE.md "Context efficiency" rule 5.)

Format: `- [Pn, YYYY-MM-DD] <decision touched> — <evidence> — <suggested action>`

- [P4, 2026-08-26] cursor contract (wipe on account change) — the sign-in screen now confirms
  before a potentially different-account magic link is SENT, but the deep-link/OAuth arrival
  path still applies the wipe without confirmation (the session is already established when the
  transition runs). Pre-P8 blast radius = the previous account's unsynced tasks. — P8: hold the
  wipe behind a deferred-transition confirm when unacked ops exist.
- [P4, 2026-08-26] ADR-0005 §6 (instantiate from max prior_cells version) — fine while only v0
  exists; once P11's empirical-Bayes refresh lands, "highest version" should probably become
  "highest PROMOTED version" via model_registry. — decide in P11 with the registry gate.
- [P5, 2026-08-26] Appendix A λ_f = 0.5 (fragmentation penalty) — equals the whole weight of a
  v = 1, q̂ = 0.5 task, so such tasks are deferred rather than split (spec-conflicts L15). — P7:
  retune λ_f against observed q̂ scales (e.g. proportional to v·q̂) with an ADR.
- [P5, 2026-08-26] File 04 §1.5 "4·10⁴ literals" trigger — measured presolve-bound UNKNOWN at
  ~10⁴ on the P5 model (spec-conflicts M8); the service uses a practical 8·10³ threshold plus
  UNKNOWN escalation. — P6/P12: re-measure on the 2 vCPU Space and fix the threshold by ADR.
- [P5, 2026-08-26] PostgresRepo connects as the pooler's `postgres` role (RLS-bypassing). Fine
  for a trusted backend, but least privilege wants a dedicated `recsys_service` role limited to
  model-state tables. — P12 runbook: create the role + grants, rotate the DSN.
- [P5, 2026-08-26] ADR-0007 §5 eligibility "≥ m feasible buckets" — on a plain 09–18 weekday
  without busy blocks only tasks ≤ 45 min have four reachable buckets (EV.wd holds ≤ 3 ticks +
  buffer), so the "1 slot/day" default often yields no experiment: an RQ4 data-rate risk
  (adversarial NOTE). — Owner call before OSF freeze: keep p = ε/m with the strict rule, or allow
  |A_m(x)| ∈ {2, 3} with the exact per-row p = ε/|A_m(x)| (still uniform within the slice; File
  04 §2.2 replay restricted to A_m(x) works per row; `experiment_top_m` is now logged for it).
- [P5, 2026-08-26] Slice selection — every INFEASIBLE-after-pin drop and every UNKNOWN rung is a
  selection on the randomized slice; `experiment_dropped`/`degradation`/`tick_minutes` live only
  in /plan telemetry. — P6: persist plan telemetry per recommendation row; P11: report drop rate.
