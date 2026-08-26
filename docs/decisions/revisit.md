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
